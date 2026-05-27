"""
Function Tools API — CRUD scoped to an agent.
Tools are stored in agent.config["tools"] as a JSON array (no DB migration needed).

GET    /api/agents/{agent_id}/tools           → list tools
POST   /api/agents/{agent_id}/tools           → add tool
PUT    /api/agents/{agent_id}/tools/{tool_id} → update tool
DELETE /api/agents/{agent_id}/tools/{tool_id} → delete tool (204)
"""
import uuid
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.auth.dependencies import require_workspace, get_current_user
from backend.db.database import get_db
from backend.db.models import Agent, User, Workspace

log = structlog.get_logger()
router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ToolCreate(BaseModel):
    name: str
    type: str                                  # webhook | end_call | transfer_call
    description: str = ""
    parameters: dict[str, Any] = {}
    config: dict[str, Any] = {}
    enabled: bool = True


class ToolUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    parameters: Optional[dict[str, Any]] = None
    config: Optional[dict[str, Any]] = None
    enabled: Optional[bool] = None


class ToolOut(BaseModel):
    id: str
    name: str
    type: str
    description: str
    parameters: dict[str, Any]
    config: dict[str, Any]
    enabled: bool

    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_agent_for_workspace(
    agent_id: str,
    workspace: Workspace,
    db: AsyncSession,
    user: User | None = None,
) -> Agent:
    agent = await db.get(Agent, agent_id)
    if not agent or agent.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.is_personal and user and agent.created_by != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


def _get_tools(agent: Agent) -> list[dict]:
    return list((agent.config or {}).get("tools") or [])


def _save_tools(agent: Agent, tools: list[dict]):
    cfg = dict(agent.config or {})
    cfg["tools"] = tools
    agent.config = cfg
    flag_modified(agent, "config")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{agent_id}/tools", response_model=list[ToolOut])
async def list_tools(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    agent = await _get_agent_for_workspace(agent_id, workspace, db, user)
    return _get_tools(agent)


@router.post("/{agent_id}/tools", response_model=ToolOut, status_code=201)
async def add_tool(
    agent_id: str,
    payload: ToolCreate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    agent = await _get_agent_for_workspace(agent_id, workspace, db, user)
    tools = _get_tools(agent)

    tool = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "type": payload.type,
        "description": payload.description,
        "parameters": payload.parameters,
        "config": payload.config,
        "enabled": payload.enabled,
    }
    tools.append(tool)
    _save_tools(agent, tools)
    await db.commit()
    log.info("Tool added", agent_id=agent_id, tool_name=payload.name, tool_id=tool["id"])
    return tool


@router.put("/{agent_id}/tools/{tool_id}", response_model=ToolOut)
async def update_tool(
    agent_id: str,
    tool_id: str,
    payload: ToolUpdate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    agent = await _get_agent_for_workspace(agent_id, workspace, db, user)
    tools = _get_tools(agent)

    for i, t in enumerate(tools):
        if t.get("id") == tool_id:
            updates = payload.model_dump(exclude_none=True)
            tools[i] = {**t, **updates}
            _save_tools(agent, tools)
            await db.commit()
            log.info("Tool updated", agent_id=agent_id, tool_id=tool_id)
            return tools[i]

    raise HTTPException(status_code=404, detail="Tool not found")


@router.delete("/{agent_id}/tools/{tool_id}", status_code=204)
async def delete_tool(
    agent_id: str,
    tool_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    agent = await _get_agent_for_workspace(agent_id, workspace, db, user)
    tools = _get_tools(agent)

    new_tools = [t for t in tools if t.get("id") != tool_id]
    if len(new_tools) == len(tools):
        raise HTTPException(status_code=404, detail="Tool not found")

    _save_tools(agent, new_tools)
    await db.commit()
    log.info("Tool deleted", agent_id=agent_id, tool_id=tool_id)
