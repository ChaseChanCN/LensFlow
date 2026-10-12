"""Todo API routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import NotFoundException
from app.deps import get_current_user
from app.models.todo import TodoItem
from app.models.user import User
from app.schemas.todo import TodoResponse, TodoUpdateRequest

router = APIRouter(prefix="/todos", tags=["todos"])


@router.get("", response_model=list[TodoResponse])
def list_todos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(TodoItem)
        .filter(TodoItem.assignee_id == current_user.id)
        .order_by(TodoItem.created_at.desc())
        .all()
    )


@router.patch("/{todo_id}", response_model=TodoResponse)
def update_todo(
    todo_id: int,
    req: TodoUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    todo = db.query(TodoItem).filter(TodoItem.id == todo_id).first()
    if not todo:
        raise NotFoundException("TodoItem")
    todo.done = req.done
    db.commit()
    db.refresh(todo)
    return todo
