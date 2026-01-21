import React from 'react';
import { DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, User } from '../types';
import { TaskCard } from './TaskCard';

interface KanbanBoardProps {
  tasks: Task[];
  user: User;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTaskStatus: (taskId: string, newStatus: Task['status']) => void;
}

// KanbanColumn Component
interface KanbanColumnProps {
  id: Task['status'];
  title: string;
  tasks: Task[];
  user: User;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ id, title, tasks, user, onEditTask, onDeleteTask }) => {
  return (
    <div className="bg-slate-100 rounded-2xl p-4 flex flex-col gap-3 min-h-[200px]">
      <h3 className="text-sm font-black text-slate-600 uppercase mb-2">{title}</h3>
      <SortableContext items={tasks.map(task => task.id)}>
        {tasks.map(task => (
          <SortableTaskCard 
            key={task.id} 
            task={task} 
            user={user}
            onEdit={onEditTask} 
            onDelete={onDeleteTask} 
          />
        ))}
      </SortableContext>
    </div>
  );
};

// SortableTaskCard Component
interface SortableTaskCardProps {
  task: Task;
  user: User;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

const SortableTaskCard: React.FC<SortableTaskCardProps> = ({ task, user, onEdit, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({id: task.id});

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} user={user} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
};


export const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, user, onEditTask, onDeleteTask, onUpdateTaskStatus }) => {
  const statuses: Task['status'][] = ['A Fazer', 'Em Progresso', 'Pausada', 'Cancelada', 'Concluída'];

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const findColumn = (id: string) => {
    if (statuses.includes(id as Task['status'])) {
      return id as Task['status'];
    }
    const task = tasks.find(t => t.id === id);
    if (task) {
      return task.status;
    }
    return undefined;
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (!over) return;

    const activeColumn = findColumn(active.id);
    const overColumn = findColumn(over.id);

    if (!activeColumn || !overColumn || activeColumn === overColumn) {
      return;
    }
    
    // Check if the over.id is a column (droppableId) or a task (draggableId)
    const newStatus = statuses.includes(over.id as Task['status']) ? (over.id as Task['status']) : overColumn;

    if (active.id !== over.id) {
      onUpdateTaskStatus(active.id, newStatus);
    }
  };

  const getTasksByStatus = (status: Task['status']) => {
    return tasks.filter(task => task.status === status);
  };

  return (
    <DndContext 
      sensors={sensors} 
      collisionDetection={closestCorners} 
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {statuses.map(status => (
          <DroppableColumn 
            key={status}
            id={status} 
            title={status} 
            tasks={getTasksByStatus(status)} 
            user={user} 
            onEditTask={onEditTask} 
            onDeleteTask={onDeleteTask} 
          />
        ))}
      </div>
    </DndContext>
  );
};

// DroppableColumn Component
interface DroppableColumnProps {
  id: Task['status'];
  title: string;
  tasks: Task[];
  user: User;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
}

const DroppableColumn: React.FC<DroppableColumnProps> = ({ id, title, tasks, user, onEditTask, onDeleteTask }) => {
  const { setNodeRef } = useDroppable({ id });
  
  return (
    <div ref={setNodeRef} className="bg-slate-100 rounded-2xl p-4 flex flex-col gap-3 min-h-[200px]">
      <h3 className="text-sm font-black text-slate-600 uppercase mb-2">{title}</h3>
      <SortableContext items={tasks.map(task => task.id)}>
        {tasks.map(task => (
          <SortableTaskCard 
            key={task.id} 
            task={task} 
            user={user}
            onEdit={onEditTask} 
            onDelete={onDeleteTask} 
          />
        ))}
      </SortableContext>
    </div>
  );
};
