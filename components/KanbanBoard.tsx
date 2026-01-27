import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Task, User } from '../types';
import { TaskCard } from './TaskCard';

// TaskCardWrapper Component (replaces SortableTaskCard)
interface TaskCardWrapperProps {
  task: Task;
  user: User;
  users: User[]; // Added
  onViewTaskClick: (task: Task) => void;
}

const TaskCardWrapper: React.FC<TaskCardWrapperProps> = ({ task, user, users, onViewTaskClick }) => {
  return (
    <div 
      className="p-1" // Small padding to differentiate visually from column
      onDoubleClick={() => onViewTaskClick(task)}
    >
      <TaskCard task={task} user={user} users={users} />
    </div>
  );
};


export const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, user, users, onViewTask, onUpdateTaskStatus }) => {
  const statuses: Task['status'][] = ['A Fazer', 'Em Progresso', 'Pausada', 'Cancelada', 'Concluída'];

  // Removed DndContext and related sensors
  // The handleDragEnd is no longer needed

  const getTasksByStatus = (status: Task['status']) => {
    return tasks.filter(task => task.status === status);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {statuses.map(status => (
        <DroppableColumn 
          key={status}
          id={status} 
          title={status} 
          tasks={getTasksByStatus(status)} 
          user={user} 
          users={users} // Pass users prop
          onViewTask={onViewTask} 
        />
      ))}
    </div>
  );
};

// DroppableColumn Component
interface DroppableColumnProps {
  id: Task['status'];
  title: string;
  tasks: Task[];
  user: User;
  users: User[]; // Added
  onViewTask: (task: Task) => void;
}

const DroppableColumn: React.FC<DroppableColumnProps> = ({ id, title, tasks, user, users, onViewTask }) => {
  const { setNodeRef } = useDroppable({ id }); // useDroppable is kept for visual indication of drop targets
  
  return (
    <div ref={setNodeRef} className="bg-slate-100 rounded-2xl p-4 flex flex-col gap-3 min-h-[200px]">
      <h3 className="text-sm font-black text-slate-600 uppercase mb-2">{title}</h3>
      {tasks.map(task => (
        <TaskCardWrapper // Use the new wrapper
          key={task.id} 
          task={task} 
          user={user}
          users={users} // Pass users prop
          onViewTaskClick={onViewTask} 
        />
      ))}
    </div>
  );
};
