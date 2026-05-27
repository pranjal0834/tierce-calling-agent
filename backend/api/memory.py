import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import require_workspace
from backend.db.database import get_db
from backend.db.models import Call, Contact, MemoryNode, MemoryEdge, Workspace
from backend.models.schemas import ContactCreate, ContactOut, MemoryNodeOut, MemoryGraphOut
from backend.utils.phone import normalize_phone

router = APIRouter()


@router.post("/contacts", response_model=ContactOut, status_code=201)
async def create_contact(
    payload: ContactCreate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    contact = Contact(
        id=str(uuid.uuid4()),
        workspace_id=workspace.id,
        **payload.model_dump(),
    )
    db.add(contact)
    await db.flush()
    await db.commit()
    return contact


@router.get("/contacts", response_model=List[ContactOut])
async def list_contacts(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    result = await db.execute(
        select(Contact).where(Contact.workspace_id == workspace.id)
    )
    return result.scalars().all()


@router.get("/contacts/{contact_id}", response_model=ContactOut)
async def get_contact(
    contact_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    contact = await db.get(Contact, contact_id)
    if not contact or contact.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.get("/contacts/{contact_id}/graph", response_model=MemoryGraphOut)
async def get_memory_graph(
    contact_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    contact = await db.get(Contact, contact_id)
    if not contact or contact.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Contact not found")

    nodes_result = await db.execute(
        select(MemoryNode).where(MemoryNode.contact_id == contact_id)
    )
    nodes = nodes_result.scalars().all()
    node_ids = {n.id for n in nodes}

    edges_result = await db.execute(
        select(MemoryEdge).where(MemoryEdge.from_node_id.in_(node_ids))
    )
    edges = [
        {"from": e.from_node_id, "to": e.to_node_id, "relation": e.relation, "weight": e.weight}
        for e in edges_result.scalars().all()
    ]

    return MemoryGraphOut(contact_id=contact_id, nodes=nodes, edges=edges)


@router.delete("/contacts/{contact_id}/memory", status_code=204)
async def clear_memory(
    contact_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    contact = await db.get(Contact, contact_id)
    if not contact or contact.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Contact not found")
    nodes_result = await db.execute(
        select(MemoryNode).where(MemoryNode.contact_id == contact_id)
    )
    for node in nodes_result.scalars().all():
        await db.delete(node)
    await db.commit()


@router.post("/contacts/merge-duplicates", status_code=200)
async def merge_duplicate_contacts(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
):
    """Normalize phone numbers and merge duplicate contacts within this workspace."""
    result = await db.execute(
        select(Contact).where(Contact.workspace_id == workspace.id)
    )
    all_contacts: list[Contact] = result.scalars().all()

    groups: dict[str, list[Contact]] = {}
    for c in all_contacts:
        norm = normalize_phone(c.phone_number)
        groups.setdefault(norm, []).append(c)

    merged_count = 0
    for norm_phone, contacts in groups.items():
        if len(contacts) < 2:
            if contacts[0].phone_number != norm_phone:
                contacts[0].phone_number = norm_phone
            continue

        counts = []
        for c in contacts:
            n = await db.execute(
                select(MemoryNode).where(MemoryNode.contact_id == c.id)
            )
            counts.append((len(n.scalars().all()), c))
        counts.sort(key=lambda x: x[0], reverse=True)
        winner = counts[0][1]
        losers = [c for _, c in counts[1:]]

        for loser in losers:
            await db.execute(
                update(MemoryNode).where(MemoryNode.contact_id == loser.id).values(contact_id=winner.id)
            )
            await db.execute(
                update(Call).where(Call.contact_id == loser.id).values(contact_id=winner.id)
            )
            await db.execute(
                delete(Contact).where(Contact.id == loser.id)
            )
            merged_count += 1

        winner.phone_number = norm_phone

    await db.commit()
    return {"merged_contacts_removed": merged_count, "message": "Duplicate contacts merged successfully"}
