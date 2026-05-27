import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.auth.dependencies import require_workspace, get_current_user
from backend.db.database import get_db
from backend.db.models import Agent, User, Workspace
from backend.models.schemas import AgentCreate, AgentUpdate, AgentOut

router = APIRouter()


@router.post("", response_model=AgentOut, status_code=201)
async def create_agent(
    payload: AgentCreate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    agent = Agent(
        id=str(uuid.uuid4()),
        workspace_id=workspace.id,
        name=payload.name,
        description=payload.description,
        system_prompt=payload.system_prompt,
        pipeline_mode=payload.pipeline_mode,
        llm_model=payload.llm_model,
        voice_id=payload.voice_id,
        config=payload.config.model_dump(),
        is_personal=payload.is_personal,
        created_by=user.id,
    )
    db.add(agent)
    await db.flush()
    await db.commit()
    return agent


@router.get("", response_model=List[AgentOut])
async def list_agents(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Agent).where(
            Agent.workspace_id == workspace.id,
            Agent.is_active == True,
            or_(
                Agent.is_personal == False,
                and_(Agent.is_personal == True, Agent.created_by == user.id),
            ),
        )
    )
    return result.scalars().all()


@router.get("/{agent_id}", response_model=AgentOut)
async def get_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    agent = await db.get(Agent, agent_id)
    if not agent or agent.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.is_personal and agent.created_by != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.put("/{agent_id}", response_model=AgentOut)
async def update_agent(
    agent_id: str,
    payload: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    agent = await db.get(Agent, agent_id)
    if not agent or agent.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.is_personal and agent.created_by != user.id:
        raise HTTPException(status_code=403, detail="Cannot edit another member's personal agent")
    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "config" and isinstance(value, dict):
            agent.config = {**agent.config, **value}
            flag_modified(agent, "config")
        else:
            setattr(agent, field, value)
    await db.commit()
    return agent


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(require_workspace),
    user: User = Depends(get_current_user),
):
    agent = await db.get(Agent, agent_id)
    if not agent or agent.workspace_id != workspace.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.is_personal and agent.created_by != user.id:
        raise HTTPException(status_code=403, detail="Cannot delete another member's personal agent")
    agent.is_active = False
    await db.commit()
