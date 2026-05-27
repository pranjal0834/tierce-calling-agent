"""
Memory Extractor — runs after each call, extracts facts about the contact.

Extracted node types:
  - person     (name, title, role)
  - company    (company name, industry, size)
  - product    (products mentioned/interested in)
  - issue      (problems/complaints raised)
  - preference (communication preferences, timing, pricing sensitivity)
  - event      (what happened on this call — outcome, next steps)
  - fact       (any other verifiable fact)

Each node has:
  - label: short name (e.g. "interested_in_premium_plan")
  - value: detail (e.g. "User asked about pricing 3 times")
  - confidence: 0.0–1.0
"""
import json
import uuid
from datetime import datetime
from typing import Optional

import structlog
from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db.models import Call, CallTurn, Contact, MemoryNode, MemoryEdge

log = structlog.get_logger()

_EXTRACTION_PROMPT = """You are a memory extraction system for an AI voice agent platform.
Extract key facts about the CONTACT (the person being called) from this call transcript.

Extract facts in these categories:
- person: name, job title, company role
- company: their company name, industry
- product: products/services they mentioned interest in or own
- issue: problems, complaints, objections raised
- preference: timing preferences, budget, communication style
- event: what happened on this call (outcome, agreed next step)
- fact: any other important verifiable fact

For each fact, provide:
- node_type: one of [person, company, product, issue, preference, event, fact]
- label: snake_case short label (e.g. "interested_in_enterprise_plan")
- value: detailed description (1-2 sentences)
- confidence: 0.0-1.0

Also identify RELATIONSHIPS between nodes:
- from_label, to_label, relation (e.g. "works_at", "interested_in", "reported_issue")

Return ONLY valid JSON:
{
  "nodes": [
    {"node_type": "person", "label": "name", "value": "John Smith", "confidence": 0.95},
    {"node_type": "preference", "label": "budget_sensitive", "value": "Asked about cost 3 times", "confidence": 0.9}
  ],
  "edges": [
    {"from_label": "name", "to_label": "budget_sensitive", "relation": "has_preference"}
  ]
}"""


class MemoryExtractor:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def extract_and_store(self, call_id: str, contact_id: str):
        """Extract facts from a completed call and merge into the contact's memory graph."""
        call = await self.db.get(Call, call_id)
        if not call:
            return

        transcript = await self._build_transcript(call_id)
        if not transcript:
            return

        extraction = await self._extract(transcript)
        if not extraction:
            return

        await self._merge_into_graph(
            contact_id=contact_id,
            call_id=call_id,
            nodes=extraction.get("nodes", []),
            edges=extraction.get("edges", []),
        )
        log.info(
            "Memory extracted",
            call_id=call_id,
            contact_id=contact_id,
            nodes=len(extraction.get("nodes", [])),
        )

    async def _build_transcript(self, call_id: str) -> str:
        result = await self.db.execute(
            select(CallTurn)
            .where(CallTurn.call_id == call_id)
            .order_by(CallTurn.turn_index)
        )
        turns = result.scalars().all()
        lines = []
        for turn in turns:
            if turn.transcript:
                role = "User" if turn.role == "user" else "Agent"
                lines.append(f"{role}: {turn.transcript}")
        return "\n".join(lines)

    async def _extract(self, transcript: str) -> Optional[dict]:
        try:
            response = await self.client.chat.completions.create(
                model="gpt-4.1-mini",
                messages=[
                    {"role": "system", "content": _EXTRACTION_PROMPT},
                    {"role": "user", "content": f"Call transcript:\n{transcript}"},
                ],
                max_tokens=1000,
                temperature=0,
                response_format={"type": "json_object"},
            )
            return json.loads(response.choices[0].message.content)
        except Exception as exc:
            log.warning("Memory extraction failed", error=str(exc))
            return None

    async def _merge_into_graph(
        self,
        contact_id: str,
        call_id: str,
        nodes: list[dict],
        edges: list[dict],
    ):
        """Merge extracted nodes into DB — update if label exists, create if new."""
        label_to_node_id: dict[str, str] = {}

        for node_data in nodes:
            label = node_data.get("label", "")
            if not label:
                continue

            # Check if node already exists for this contact + label
            result = await self.db.execute(
                select(MemoryNode)
                .where(MemoryNode.contact_id == contact_id)
                .where(MemoryNode.label == label)
                .limit(1)
            )
            existing = result.scalar_one_or_none()

            if existing:
                # Update confidence and value (running average)
                existing.confidence = min(
                    1.0, (existing.confidence + node_data.get("confidence", 0.8)) / 2 + 0.1
                )
                existing.value = node_data.get("value", existing.value)
                existing.updated_at = datetime.utcnow()
                label_to_node_id[label] = existing.id
            else:
                node = MemoryNode(
                    id=str(uuid.uuid4()),
                    contact_id=contact_id,
                    node_type=node_data.get("node_type", "fact"),
                    label=label,
                    value=node_data.get("value"),
                    confidence=node_data.get("confidence", 0.8),
                    source_call_id=call_id,
                )
                self.db.add(node)
                label_to_node_id[label] = node.id

        await self.db.flush()

        # Create edges
        for edge_data in edges:
            from_id = label_to_node_id.get(edge_data.get("from_label", ""))
            to_id = label_to_node_id.get(edge_data.get("to_label", ""))
            if from_id and to_id and from_id != to_id:
                edge = MemoryEdge(
                    id=str(uuid.uuid4()),
                    from_node_id=from_id,
                    to_node_id=to_id,
                    relation=edge_data.get("relation", "related_to"),
                )
                self.db.add(edge)

        await self.db.flush()
