"""
Memory Retriever — fetches relevant context before a call starts.
Formats the contact's memory graph into a natural language summary
injected into the agent's system prompt.

This gives the agent:
  - Who they're calling (name, company, role)
  - What was discussed before (past issues, interests, outcomes)
  - Preferences (budget sensitivity, preferred contact time)
  - Open items (agreed next steps from last call)

Result: hyper-personalized first sentence instead of "Hi, how can I help?"
"""
from typing import Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Contact, MemoryNode, Call, CallTurn

log = structlog.get_logger()


class MemoryRetriever:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_context_for_call(
        self,
        contact_id: str,
        max_nodes: int = 20,
    ) -> str:
        """Build a natural language memory summary for injection into system prompt."""
        contact = await self.db.get(Contact, contact_id)
        if not contact:
            return ""

        # Get all memory nodes for this contact, ordered by confidence
        result = await self.db.execute(
            select(MemoryNode)
            .where(MemoryNode.contact_id == contact_id)
            .order_by(MemoryNode.confidence.desc())
            .limit(max_nodes)
        )
        nodes = result.scalars().all()

        if not nodes:
            return ""

        # Get last call summary
        last_call_summary = await self._get_last_call_summary(contact_id)

        # Group nodes by type
        grouped: dict[str, list[MemoryNode]] = {}
        for node in nodes:
            grouped.setdefault(node.node_type, []).append(node)

        lines = [f"Contact: {contact.name or contact.phone_number}"]
        if contact.company:
            lines.append(f"Company: {contact.company}")

        type_labels = {
            "person":     "Personal info",
            "company":    "Company details",
            "product":    "Product interests",
            "issue":      "Known issues/concerns",
            "preference": "Preferences",
            "event":      "Past interactions",
            "fact":       "Key facts",
        }

        for node_type, type_nodes in grouped.items():
            label = type_labels.get(node_type, node_type.capitalize())
            lines.append(f"\n{label}:")
            for node in type_nodes[:5]:
                value = f" — {node.value}" if node.value else ""
                lines.append(f"  • {node.label.replace('_', ' ')}{value}")

        if last_call_summary:
            lines.append(f"\nLast call: {last_call_summary}")

        context = "\n".join(lines)
        log.debug("Memory context built", contact_id=contact_id, chars=len(context))
        return context

    async def _get_last_call_summary(self, contact_id: str) -> Optional[str]:
        result = await self.db.execute(
            select(Call)
            .where(Call.contact_id == contact_id)
            .where(Call.status == "completed")
            .order_by(Call.ended_at.desc())
            .limit(1)
        )
        last_call = result.scalar_one_or_none()
        if not last_call:
            return None

        if last_call.summary:
            return last_call.summary

        # Fall back to last few agent turns
        turns_result = await self.db.execute(
            select(CallTurn)
            .where(CallTurn.call_id == last_call.id)
            .where(CallTurn.role == "agent")
            .order_by(CallTurn.turn_index.desc())
            .limit(2)
        )
        last_turns = turns_result.scalars().all()
        if last_turns:
            last_agent = last_turns[0].transcript or ""
            return f"Agent said: \"{last_agent[:150]}...\""
        return None
