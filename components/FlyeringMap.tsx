import React, { useState, useEffect, useMemo, memo } from 'react';
import { MapContainer, TileLayer, Polyline, Polygon, Popup, useMap } from 'react-leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import 'leaflet/dist/leaflet.css';
import { FlyeringTask, User } from '../types';
import { FlyeringTaskModal } from './FlyeringTaskModal';
import { FlyeringLegend } from './FlyeringLegend';
import { FlyeringTutorial } from './FlyeringTutorial';
import L from 'leaflet';

// Fix para ícones do Leaflet no React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface FlyeringMapProps {
  user: User;
  users: User[];
  onLog: (action: string, details: string) => void;
}

// Função para gerar cor única baseada no ID do usuário
const generateColorFromUserId = (userId: string): string => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = Math.abs(hash % 360);
  const saturation = 65 + (Math.abs(hash) % 20); // 65-85%
  const lightness = 45 + (Math.abs(hash >> 8) % 15); // 45-60%
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

// Componente auxiliar para gerenciar controles de desenho (memoizado)
const DrawControls: React.FC<{
  onCreated: (type: 'polyline' | 'polygon', coords: number[][]) => void;
  isAdmin: boolean;
}> = memo(({ onCreated, isAdmin }) => {
  const map = useMap();

  useEffect(() => {
    if (!isAdmin) return;

    // Configura Geoman
    map.pm.addControls({
      position: 'topright',
      drawCircle: false,
      drawCircleMarker: false,
      drawMarker: false,
      drawRectangle: false,
      drawPolygon: true,
      drawPolyline: true,
      editMode: false,
      dragMode: false,
      cutPolygon: false,
      removalMode: false,
    });

    // Traduzir textos para português
    map.pm.setLang('pt_br', {
      tooltips: {
        placeMarker: 'Clique para colocar marcador',
        firstVertex: 'Clique para colocar o primeiro vértice',
        continueLine: 'Clique para continuar desenhando',
        finishLine: 'Clique em qualquer ponto existente para finalizar',
        finishPoly: 'Clique no primeiro ponto para fechar a forma',
        finishRect: 'Clique para finalizar',
        startCircle: 'Clique para colocar o centro do círculo',
        finishCircle: 'Clique para finalizar o círculo',
        placeCircleMarker: 'Clique para colocar o marcador circular',
      },
      actions: {
        finish: 'Finalizar',
        cancel: 'Cancelar',
        removeLastVertex: 'Remover último vértice',
      },
      buttonTitles: {
        drawPolyButton: 'Desenhar Quarteirão/Área',
        drawLineButton: 'Desenhar Rua/Linha',
        drawCircleButton: 'Desenhar Círculo',
        drawRectButton: 'Desenhar Retângulo',
        editButton: 'Editar Camadas',
        dragButton: 'Arrastar Camadas',
        cutButton: 'Cortar Camadas',
        deleteButton: 'Remover Camadas',
        drawMarkerButton: 'Desenhar Marcador',
        drawCircleMarkerButton: 'Desenhar Marcador Circular',
      },
    }, 'pt_br');

    // Handler para quando uma forma é criada
    const handleDrawCreate = (e: any) => {
      const layer = e.layer;
      const shape = e.shape;

      let coordinates: number[][] = [];
      
      if (shape === 'Line') {
        const latlngs = layer.getLatLngs();
        coordinates = latlngs.map((latlng: L.LatLng) => [latlng.lat, latlng.lng]);
        onCreated('polyline', coordinates);
      } else if (shape === 'Polygon') {
        const latlngs = layer.getLatLngs()[0]; // Polígonos retornam array de arrays
        coordinates = latlngs.map((latlng: L.LatLng) => [latlng.lat, latlng.lng]);
        onCreated('polygon', coordinates);
      }

      // Remove a camada temporária do mapa
      map.removeLayer(layer);
    };

    map.on('pm:create', handleDrawCreate);

    return () => {
      map.off('pm:create', handleDrawCreate);
      map.pm.removeControls();
    };
  }, [map, isAdmin, onCreated]);

  return null;
});

DrawControls.displayName = 'DrawControls';

// Componente auxiliar para centralizar mapa (memoizado)
const MapCenterController: React.FC<{ center: [number, number] }> = memo(({ center }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 15);
  }, [center, map]);
  return null;
});

MapCenterController.displayName = 'MapCenterController';

// Componente memoizado para renderizar Polyline
const TaskPolyline = memo<{ task: FlyeringTask; popupContent: string }>(({ task, popupContent }) => (
  <Polyline
    positions={task.coordinates as [number, number][]}
    pathOptions={{
      color: task.color,
      weight: 5,
      opacity: task.status === 'Concluído' ? 0.5 : 0.8,
    }}
  >
    <Popup>
      <div dangerouslySetInnerHTML={{ __html: popupContent }} />
    </Popup>
  </Polyline>
));

TaskPolyline.displayName = 'TaskPolyline';

// Componente memoizado para renderizar Polygon
const TaskPolygon = memo<{ task: FlyeringTask; popupContent: string }>(({ task, popupContent }) => (
  <Polygon
    positions={task.coordinates as [number, number][]}
    pathOptions={{
      color: task.color,
      fillColor: task.color,
      fillOpacity: task.status === 'Concluído' ? 0.2 : 0.4,
      weight: 3,
    }}
  >
    <Popup>
      <div dangerouslySetInnerHTML={{ __html: popupContent }} />
    </Popup>
  </Polygon>
));

TaskPolygon.displayName = 'TaskPolygon';


export const FlyeringMap: React.FC<FlyeringMapProps> = memo(({ user, users, onLog }) => {
  const [tasks, setTasks] = useState<FlyeringTask[]>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [currentGeometry, setCurrentGeometry] = useState<{
    type: 'polyline' | 'polygon';
    coordinates: number[][];
  } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const isAdmin = user.role === 'Administrador';

  // Coordenadas da Farmácia Bela Farma Sul, Santa Luzia, Juiz de Fora - MG
  const centerCoordinates: [number, number] = [-21.78, -43.36];

  // Função para buscar tarefas da API
  const fetchTasks = async () => {
    try {
      const response = await fetch('/api/flyering');
      if (!response.ok) throw new Error('Failed to fetch flyering tasks');
      const data = await response.json();
      setTasks(data);
    } catch (error) {
      console.error('Error fetching flyering tasks:', error);
    }
  };

  useEffect(() => {
    // Delay para carregar mapa após renderização inicial
    const timer = setTimeout(() => setIsMapReady(true), 100);
    fetchTasks();
    
    // Verificar se é primeira vez
    const hasSeenTutorial = localStorage.getItem('flyering-tutorial-seen');
    if (!hasSeenTutorial && user.role === 'Administrador') {
      // Mostrar tutorial após mapa carregar
      setTimeout(() => setShowTutorial(true), 1000);
    }
    
    return () => clearTimeout(timer);
  }, [user.role]);

  // Handler para quando o usuário termina de desenhar
  const handleCreated = (type: 'polyline' | 'polygon', coordinates: number[][]) => {
    setCurrentGeometry({ type, coordinates });
    setIsModalOpen(true);
  };

  // Handler para fechar tutorial
  const handleCloseTutorial = () => {
    setShowTutorial(false);
    localStorage.setItem('flyering-tutorial-seen', 'true');
  };

  // Handler para salvar tarefa
  const handleSaveTask = async (taskData: Omit<FlyeringTask, 'id' | 'createdAt' | 'createdBy' | 'color' | 'type' | 'coordinates'>) => {
    if (!currentGeometry) return;

    const color = generateColorFromUserId(taskData.assignedUserId);

    const newTask: FlyeringTask = {
      ...taskData,
      id: `flyering-${Date.now()}`,
      type: currentGeometry.type,
      coordinates: currentGeometry.coordinates,
      color,
      createdAt: new Date().toISOString(),
      createdBy: user.id,
    };

    try {
      const response = await fetch('/api/flyering', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      });

      if (!response.ok) throw new Error('Failed to save flyering task');

      onLog('Panfletagem', `Criou tarefa de panfletagem: ${taskData.description || 'Área sem descrição'}`);
      setIsModalOpen(false);
      setCurrentGeometry(null);
      fetchTasks();
    } catch (error) {
      console.error('Error saving flyering task:', error);
      alert('Erro ao salvar tarefa de panfletagem.');
    }
  };

  // Handler para atualizar status da tarefa
  const handleUpdateTaskStatus = async (taskId: string, newStatus: FlyeringTask['status']) => {
    const taskToUpdate = tasks.find(t => t.id === taskId);
    if (!taskToUpdate) return;

    try {
      const response = await fetch(`/api/flyering/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...taskToUpdate, status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update task');

      onLog('Panfletagem', `Atualizou status da tarefa para "${newStatus}"`);
      fetchTasks();
    } catch (error) {
      console.error('Error updating task:', error);
      alert('Erro ao atualizar tarefa.');
    }
  };

  // Handler para deletar tarefa
  const handleDeleteTask = async (taskId: string) => {
    if (!isAdmin) return;
    if (!window.confirm('Tem certeza que deseja excluir esta área?')) return;

    try {
      const response = await fetch(`/api/flyering/${taskId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete task');

      onLog('Panfletagem', `Excluiu tarefa de panfletagem ID: ${taskId}`);
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Erro ao excluir tarefa.');
    }
  };

  // Filtrar tarefas por usuário selecionado
  const filteredTasks = selectedUserId
    ? tasks.filter(t => t.assignedUserId === selectedUserId)
    : tasks;

  // Obter usuário por ID (memoizado)
  const getUserById = useMemo(() => {
    const userMap = new Map(users.map(u => [u.id, u]));
    return (userId: string) => userMap.get(userId);
  }, [users]);

  // Loading state
  if (!isMapReady) {
    return (
      <div className="relative h-[calc(100vh-200px)] min-h-[500px] rounded-2xl overflow-hidden border-2 border-slate-200 shadow-xl flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-slate-300 border-t-blue-600 mb-4"></div>
          <p className="text-slate-600 font-bold">Carregando mapa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-200px)] min-h-[500px] rounded-2xl overflow-hidden border-2 border-slate-200 shadow-xl">
      <MapContainer
        center={centerCoordinates}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
        preferCanvas={true}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <MapCenterController center={centerCoordinates} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Controles de desenho (apenas para admin) */}
        <DrawControls onCreated={handleCreated} isAdmin={isAdmin} />

        {/* Renderizar tarefas existentes */}
        {filteredTasks.map(task => {
          const assignedUser = getUserById(task.assignedUserId);
          const statusEmoji = {
            'Pendente': '⏳',
            'Em Andamento': '🔄',
            'Concluído': '✅'
          };

          const popupContent = `
            <div style="font-family: sans-serif; min-width: 200px;">
              <strong style="font-size: 14px;">${statusEmoji[task.status]} ${task.description || 'Área de panfletagem'}</strong><br/>
              <span style="font-size: 12px; color: #666;">
                👤 ${assignedUser?.name || 'Usuário desconhecido'}<br/>
                📊 Status: ${task.status}<br/>
                📅 Criado em: ${new Date(task.createdAt).toLocaleDateString('pt-BR')}
              </span>
            </div>
          `;

          return task.type === 'polyline' ? (
            <TaskPolyline key={task.id} task={task} popupContent={popupContent} />
          ) : (
            <TaskPolygon key={task.id} task={task} popupContent={popupContent} />
          );
        })}
      </MapContainer>

      {/* Legenda */}
      <FlyeringLegend
        tasks={tasks}
        users={users}
        selectedUserId={selectedUserId}
        onSelectUser={setSelectedUserId}
        onDeleteTask={isAdmin ? handleDeleteTask : undefined}
        onUpdateStatus={handleUpdateTaskStatus}
      />

      {/* Botão de Ajuda (fixo) */}
      {isAdmin && (
        <button
          onClick={() => setShowTutorial(true)}
          className="absolute bottom-4 right-4 z-[500] bg-blue-600 hover:bg-blue-700 text-white rounded-full p-3 shadow-xl transition-all hover:scale-110"
          title="Ver tutorial"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      )}

      {/* Tutorial interativo */}
      {showTutorial && <FlyeringTutorial onClose={handleCloseTutorial} />}

      {/* Modal para criar tarefa */}
      {isModalOpen && (
        <FlyeringTaskModal
          users={users}
          currentUser={user}
          geometryType={currentGeometry?.type || 'polygon'}
          onClose={() => {
            setIsModalOpen(false);
            setCurrentGeometry(null);
          }}
          onSave={handleSaveTask}
        />
      )}
    </div>
  );
});

FlyeringMap.displayName = 'FlyeringMap';
