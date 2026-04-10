import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import { 
  Navigation, Power, Clock, Download, History, Home, FileText, 
  Search, Menu, Layers, Crosshair, Plus, Minus, Coffee, Bed, Landmark, Bus, Map as MapIcon, Image as ImageIcon, FileSpreadsheet, FileJson, ChevronLeft, Glasses, Trash2,
  ShieldCheck, AlertTriangle, Settings, Bell, User
} from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { Toast } from '@capacitor/toast';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

import { cn } from '../lib/utils';
import L from 'leaflet';
import * as XLSX from 'xlsx';
import * as htmlToImage from 'html-to-image';

const PHNOM_PENH: [number, number] = [11.5564, 104.9282];

const createCustomIcon = (color: string, size: number = 18) => L.divIcon({
  className: 'custom-pin',
  html: `<div style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
  iconSize: [size, size],
  iconAnchor: [size/2, size/2]
});

const startIcon = createCustomIcon('#22c55e'); // Green
const endIcon = createCustomIcon('#ef4444');   // Red
const currentIcon = createCustomIcon('#3b82f6'); // Blue

const formatDistance = (km: number) => {
  if (km < 1) {
    return `${(km * 1000).toFixed(0)}m`;
  }
  return `${km.toFixed(2)}km`;
};

interface Trip {
  id: string;
  driverName: string;
  startTime: number;
  endTime: number;
  duration: number;
  distance: number;
  startLocation: [number, number];
  endLocation: [number, number];
  path: [number, number][];
  image?: string;
}

// Custom Map Controls Component to interact with Leaflet map instance
function MapControls({ onLocate }: { onLocate: (loc: [number, number]) => void }) {
  const map = useMap();
  return (
    <div className="absolute bottom-32 md:bottom-8 right-4 z-[1000] flex flex-col gap-2">
      <button 
        onClick={() => {}} 
        className="bg-white p-2.5 rounded-xl shadow-md hover:bg-gray-50 text-gray-700 transition-colors"
        title="Layers"
      >
        <Layers size={20} />
      </button>
      <button 
        onClick={async () => {
          try {
            const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
            const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
            map.flyTo(loc, 17, { duration: 1.5 });
            onLocate(loc);
          } catch (e) {
            await Toast.show({ text: "Please enable GPS to locate yourself." });
          }
        }} 
        className="bg-white p-2.5 rounded-xl shadow-md hover:bg-gray-50 text-blue-600 transition-colors active:scale-90"
        title="My Location"
      >
        <Crosshair size={20} />
      </button>
      <div className="bg-white rounded-xl shadow-md flex flex-col overflow-hidden mt-2">
        <button 
          onClick={() => map.zoomIn()} 
          className="p-2.5 hover:bg-gray-50 border-b border-gray-100 text-gray-700 transition-colors"
          title="Zoom In"
        >
          <Plus size={20} />
        </button>
        <button 
          onClick={() => map.zoomOut()} 
          className="p-2.5 hover:bg-gray-50 text-gray-700 transition-colors"
          title="Zoom Out"
        >
          <Minus size={20} />
        </button>
      </div>
    </div>
  );
}

function FilterChip({ icon, label }: { icon: React.ReactNode, label: string }) {
  const [active, setActive] = useState(false);
  return (
    <button 
      onClick={() => setActive(!active)}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full shadow-sm border text-sm font-medium whitespace-nowrap transition-colors",
        active 
          ? "bg-blue-50 border-blue-200 text-blue-700" 
          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export default function DriverApp() {
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'export'>('home');
  const [driverName, setDriverName] = useState('');
  const [isDriving, setIsDriving] = useState(false);
  const [duration, setDuration] = useState(0);
  const [distance, setDistance] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [location, setLocation] = useState<[number, number]>(PHNOM_PENH);
  const [currentPath, setCurrentPath] = useState<[number, number][]>([]);
  const [currentStartTime, setCurrentStartTime] = useState<number | null>(null);
  const [lastTrip, setLastTrip] = useState<Trip | null>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [previewType, setPreviewType] = useState<'csv' | 'xlsx' | 'json' | 'png' | null>(null);
  const [tripImage, setTripImage] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [isInitializing, setIsInitializing] = useState(true);
  
  const [trips, setTrips] = useState<Trip[]>([]);

  // Load data from localStorage on mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedTrips = localStorage.getItem('ess_trips');
        if (savedTrips) {
          const parsed = JSON.parse(savedTrips);
          if (Array.isArray(parsed)) setTrips(parsed);
        } else {
          // Default initial trip
          setTrips([
            {
              id: '1',
              driverName: 'John Doe',
              startTime: Date.now() - 86400000 - 1450000,
              endTime: Date.now() - 86400000,
              duration: 1450,
              distance: 12.4,
              startLocation: [11.5564, 104.9282],
              endLocation: [11.5764, 104.9482],
              path: []
            }
          ]);
        }
        const savedName = localStorage.getItem('ess_driver_name');
        if (savedName) setDriverName(savedName);
      }
    } catch (e) {
      console.error("LocalStorage restricted or failed", e);
    }
  }, []);

  // Persist trips to localStorage
  useEffect(() => {
    try {
      if (trips.length > 0 && typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('ess_trips', JSON.stringify(trips));
      }
    } catch (e) {
      console.error("Failed to save trips", e);
    }
  }, [trips]);

  // Persist driverName to localStorage
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('ess_driver_name', driverName);
      }
    } catch (e) {
      console.error("Failed to save name", e);
    }
  }, [driverName]);

  const checkAndRequestPermissions = async () => {
    try {
      const status = await Geolocation.checkPermissions();
      if (status.location === 'granted') {
        setPermissionStatus('granted');
        await getInitialLocation();
      } else {
        const requestStatus = await Geolocation.requestPermissions();
        setPermissionStatus(requestStatus.location);
        if (requestStatus.location === 'granted') {
          await getInitialLocation();
        }
      }
    } catch (e) {
      console.error("Permission check failed", e);
      setPermissionStatus('denied');
    } finally {
      setIsInitializing(false);
    }
  };

  const getInitialLocation = async () => {
    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000
      });
      const newLoc: [number, number] = [position.coords.latitude, position.coords.longitude];
      setLocation(newLoc);
      if (mapInstance) {
        mapInstance.flyTo(newLoc, 15);
      }
    } catch (e) {
      console.error("Initial location failed", e);
    }
  };

  useEffect(() => {
    checkAndRequestPermissions();
  }, [mapInstance]);

  useEffect(() => {
    if (isDriving && mapInstance) {
      mapInstance.setView(location);
    }
  }, [location, isDriving, mapInstance]);

  // Timer for duration
  useEffect(() => {
    let interval: any;
    if (isDriving) {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      setSpeed(0);
    }
    return () => clearInterval(interval);
  }, [isDriving]);

  useEffect(() => {
    let watchId: string | undefined;
    
    const startWatching = async () => {
      if (isDriving && permissionStatus === 'granted') {
        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 5000 },
          (position) => {
            if (position) {
              const newLoc: [number, number] = [position.coords.latitude, position.coords.longitude];
              setLocation(newLoc);
              setCurrentPath(prev => {
                const lastPoint = prev[prev.length - 1];
                if (!lastPoint) return [newLoc];
                
                const deltaMeters = L.latLng(lastPoint).distanceTo(L.latLng(newLoc));
                // Professional apps often use a smaller threshold (2-3 meters) for walking
                if (deltaMeters > 3) { 
                  setDistance(d => d + (deltaMeters / 1000));
                  return [...prev, newLoc];
                }
                return prev;
              });
              
              if (position.coords.speed !== null) {
                setSpeed(Math.round(position.coords.speed * 3.6));
              }
            }
          }
        );
      }
    };

    startWatching();
    
    return () => {
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
    };
  }, [isDriving, permissionStatus]);

  useEffect(() => {
    if (lastTrip && !isDriving) {
      // Automatically capture the trip image after a short delay to allow map tiles to load
      const timer = setTimeout(async () => {
        const element = document.getElementById('trip-summary-container');
        if (!element) return;
        
        element.classList.add('exporting-png');
        try {
          const dataUrl = await htmlToImage.toPng(element, {
            cacheBust: true,
            pixelRatio: 2,
            style: { transform: 'scale(1)', transformOrigin: 'top left' }
          });
          setTripImage(dataUrl);
          setTrips(prev => prev.map(t => t.id === lastTrip.id ? { ...t, image: dataUrl } : t));
        } catch (err) {
          console.error("Failed to generate trip image", err);
        } finally {
          element.classList.remove('exporting-png');
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [lastTrip, isDriving]);

  const handleStart = () => {
    setIsDriving(true);
    setDuration(0);
    setDistance(0);
    setCurrentPath([location]);
    setCurrentStartTime(Date.now());
    setLastTrip(null);
  };

  const handleStop = () => {
    setIsDriving(false);
    if (duration > 0) {
      const newTrip: Trip = {
        id: Date.now().toString(),
        driverName: driverName.trim() || 'Unknown Driver',
        startTime: currentStartTime || (Date.now() - duration * 1000),
        endTime: Date.now(),
        duration,
        distance,
        startLocation: currentPath[0] || location,
        endLocation: location,
        path: currentPath
      };
      setTrips(prev => [newTrip, ...prev]);
      setLastTrip(newTrip);
    }
    setCurrentPath([]);
    setCurrentStartTime(null);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatFullDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const saveAndShareFile = async (filename: string, base64Data: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await Filesystem.writeFile({
          path: filename,
          data: base64Data,
          directory: Directory.Cache
        });
        
        await Share.share({
          title: 'Export Driver Data',
          text: `Here is your driver tracker report: ${filename}`,
          url: result.uri,
          dialogTitle: 'Save or Share Report'
        });
        
        await Toast.show({ text: "File prepared successfully!" });
      } else {
        // Fallback for browser (App.html)
        const link = document.createElement("a");
        link.href = base64Data.startsWith('data:') ? base64Data : `data:application/octet-stream;base64,${base64Data}`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (e) {
      console.error("Failed to save or share file", e);
      await Toast.show({ text: "Export failed. Please check permissions." });
    }
  };

  const exportToCSV = async () => {
    const headers = ["Driver Name", "Start Time", "End Time", "Duration (sec)", "Distance (km)", "Distance (meters)", "Start Lat", "Start Lng", "End Lat", "End Lng"];
    const rows = trips.map(t => [
      t.driverName,
      new Date(t.startTime).toLocaleString(),
      new Date(t.endTime).toLocaleString(),
      t.duration,
      t.distance.toFixed(4),
      (t.distance * 1000).toFixed(0),
      t.startLocation[0],
      t.startLocation[1],
      t.endLocation[0],
      t.endLocation[1]
    ]);
    
    const csvContent = headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const base64Content = btoa(unescape(encodeURIComponent(csvContent)));
    await saveAndShareFile("my_driving_history.csv", base64Content);
  };

  const exportToJSON = async () => {
    const jsonStr = JSON.stringify(trips, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(jsonStr)));
    await saveAndShareFile("my_driving_history.json", base64Content);
  };

  const exportToXLSX = async () => {
    const worksheet = XLSX.utils.json_to_sheet(trips.map(t => ({
      'Driver Name': t.driverName,
      'Start Time': new Date(t.startTime).toLocaleString(),
      'End Time': new Date(t.endTime).toLocaleString(),
      'Duration (seconds)': t.duration,
      'Distance (km)': t.distance.toFixed(4),
      'Distance (meters)': (t.distance * 1000).toFixed(1),
      'Start Lat': t.startLocation[0].toFixed(6),
      'Start Lng': t.startLocation[1].toFixed(6),
      'End Lat': t.endLocation[0].toFixed(6),
      'End Lng': t.endLocation[1].toFixed(6)
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Trips");
    const binary = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    await saveAndShareFile("my_driving_history.xlsx", binary);
  };

  const exportTripToPNG = async () => {
    if (tripImage) {
      // TripImage is already a data URL (base64) from html-to-image
      await saveAndShareFile(`trip-summary-${Date.now()}.png`, tripImage);
    } else {
      await Toast.show({ text: "Saving map image... please wait 1 second." });
    }
  };

  return (
    <div className="flex h-[100dvh] w-full bg-gray-50 overflow-hidden font-sans flex-col md:flex-row pt-safe">
      <style>{`
        .exporting-png * {
          box-shadow: none !important;
          text-shadow: none !important;
        }
        @keyframes pulse-gentle {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(0.98); }
        }
        .animate-pulse-gentle {
          animation: pulse-gentle 2s infinite ease-in-out;
        }
      `}</style>

      {/* Professional Initialization Splash */}
      {isInitializing && (
        <div className="fixed inset-0 z-[5000] bg-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
          <div className="w-24 h-24 bg-blue-600 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-blue-500/20 animate-pulse-gentle">
            <Navigation className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight mb-2">ESS | Drive Recorder</h1>
          <p className="text-gray-500 font-medium">Initializing secure tracking systems...</p>
        </div>
      )}

      {/* Professional Permission Gate */}
      {!isInitializing && permissionStatus !== 'granted' && (
        <div className="fixed inset-0 z-[4900] bg-gray-900/40 backdrop-blur-xl flex items-center justify-center p-6 animate-in zoom-in-95 duration-300">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-8 text-center border border-white/20">
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldCheck className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Location Access Required</h2>
            <p className="text-gray-600 mb-8 leading-relaxed">
              To record your trips and provide accurate distance tracking like professional navigation apps, we need your permission to access high-precision GPS.
            </p>
            <div className="space-y-4">
              <button 
                onClick={checkAndRequestPermissions}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-600/20 transition-all active:scale-95"
              >
                Allow Permission
              </button>
              <button 
                onClick={() => setPermissionStatus('granted')} // Bypass for local testing if needed, though handled normally
                className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-bold transition-all"
              >
                Try Anyway
              </button>
            </div>
            <p className="mt-8 text-xs text-gray-400 font-medium uppercase tracking-widest">
              Secured by ESS Performance & Analysis Team
            </p>
          </div>
        </div>
      )}
      
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-20 lg:w-64 bg-white border-r border-gray-200 flex-col z-[1000] shadow-sm">
        <div className="p-4 lg:p-6 border-b border-gray-100 flex justify-center lg:justify-start">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span className="hidden lg:block whitespace-nowrap overflow-hidden text-ellipsis">ESS | Drive Recorder</span>
          </h1>
        </div>
        <nav className="flex-1 p-3 lg:p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('home')} 
            className={cn(
              "w-full flex items-center justify-center lg:justify-start gap-3 p-3 lg:px-4 lg:py-3 rounded-xl font-medium transition-colors", 
              activeTab === 'home' ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
            )}
            title="Record"
          >
            <Home className="w-5 h-5 shrink-0" /> 
            <span className="hidden lg:block">Record</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')} 
            className={cn(
              "w-full flex items-center justify-center lg:justify-start gap-3 p-3 lg:px-4 lg:py-3 rounded-xl font-medium transition-colors", 
              activeTab === 'history' ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
            )}
            title="History"
          >
            <History className="w-5 h-5 shrink-0" /> 
            <span className="hidden lg:block">History</span>
          </button>
          <button 
            onClick={() => setActiveTab('export')} 
            className={cn(
              "w-full flex items-center justify-center lg:justify-start gap-3 p-3 lg:px-4 lg:py-3 rounded-xl font-medium transition-colors", 
              activeTab === 'export' ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
            )}
            title="Export Data"
          >
            <Download className="w-5 h-5 shrink-0" /> 
            <span className="hidden lg:block">Export Data</span>
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 relative flex flex-col h-full overflow-hidden">
        {/* YouTube Style Header */}
        <header className="h-14 bg-white/80 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-4 z-[2000] shrink-0">
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <Menu className="w-6 h-6 text-gray-700" />
            </div>
            <div className="flex items-center gap-1.5 cursor-pointer">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Navigation className="w-5 h-5 text-white fill-white" />
              </div>
              <span className="text-lg font-black text-gray-900 tracking-tight">ESS <span className="text-blue-600">DRIVER</span></span>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-2">
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-700 active:scale-90">
              <Search className="w-5 h-5" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-700 relative active:scale-90">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <button className="ml-1 p-0.5 border-2 border-transparent hover:border-blue-100 rounded-full transition-all active:scale-95">
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 overflow-hidden">
                <User className="w-5 h-5" />
              </div>
            </button>
          </div>
        </header>

        {activeTab === 'home' ? (
          <div id="trip-summary-container" className="flex-1 relative flex flex-col h-full overflow-hidden">
            {/* Map Background */}
            <div className="absolute inset-0 z-0">
              <MapContainer 
                center={location} 
                zoom={15} 
                zoomControl={false} 
                attributionControl={false}
                className="w-full h-full"
                ref={setMapInstance}
              >
                {/* CartoDB Voyager Tiles (Supports CORS for image export) */}
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  maxZoom={20}
                  crossOrigin="anonymous"
                />
                
                {/* Custom Watermark */}
                <div className="leaflet-bottom leaflet-right pointer-events-none">
                  <div className="leaflet-control leaflet-control-attribution bg-white/60 backdrop-blur-md text-gray-700 font-medium px-2 py-0.5 rounded-tl-md border-l border-t border-white/50 text-[10px] shadow-sm m-0">
                    Developed By Performance and Analysis Team | ESS Division
                  </div>
                </div>
                
                {/* Current Location (hide if viewing a finished trip) */}
                {(!lastTrip || isDriving) && (
                  <Marker position={location} icon={currentIcon} />
                )}

                {/* Active Driving Route */}
                {isDriving && currentPath.length > 0 && (
                  <>
                    <Marker position={currentPath[0]} icon={startIcon} />
                    <Polyline positions={[currentPath[0], location]} color="#9ca3af" weight={3} dashArray="10, 10" opacity={0.8} />
                    <Polyline positions={currentPath} color="#3b82f6" weight={5} opacity={0.8} />
                  </>
                )}

                {/* Finished Trip Route */}
                {!isDriving && lastTrip && (
                  <>
                    <Marker position={lastTrip.startLocation} icon={startIcon} />
                    <Marker position={lastTrip.endLocation} icon={endIcon} />
                    <Polyline positions={lastTrip.path} color="#3b82f6" weight={5} opacity={0.8} />
                  </>
                )}
                
                <MapControls onLocate={(loc) => setLocation(loc)} />
              </MapContainer>
            </div>

            {/* Google Maps Style Top UI - Removed per user request */}

            {/* Floating Controls Overlay (Trip Recorder) */}
            <div className="absolute mobile-safe-bottom md:bottom-8 left-4 md:left-8 w-[calc(100%-2rem)] md:w-96 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] border border-white/50 p-4 md:p-5 z-[1000] transition-all" style={{ backgroundColor: 'rgba(255, 255, 255, 0.25)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
              {/* Status Header */}
              <div className="flex items-center justify-between mb-4 md:mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {lastTrip && !isDriving ? 'Trip Summary' : 'Trip Recorder'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {lastTrip && !isDriving ? 'Detailed trip information' : 'Personal GPS Tracking'}
                  </p>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider", 
                  isDriving ? "bg-green-100 text-green-700" : 
                  lastTrip ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                )}>
                  {isDriving ? 'Recording' : lastTrip ? 'Completed' : 'Standby'}
                </div>
              </div>

              {isDriving ? (
                <div className="space-y-4 animate-in fade-in">
                  <div className="p-3 rounded-xl border border-white/50 flex justify-between items-center text-xs shadow-sm" style={{ backgroundColor: 'rgba(255, 255, 255, 0.25)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                    <div>
                      <p className="text-[10px] text-gray-600 font-bold uppercase tracking-wider mb-0.5">Start Time</p>
                      <p className="font-bold text-gray-900">{currentStartTime ? new Date(currentStartTime).toLocaleTimeString() : '--:--'}</p>
                    </div>
                    <div className="flex-1 flex items-center justify-center px-4">
                      <div className="h-px bg-gray-300 w-full relative">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/60 backdrop-blur-md rounded-full px-2 text-[10px] text-gray-500 font-bold uppercase">to</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-600 font-bold uppercase tracking-wider mb-0.5">Current Time</p>
                      <p className="font-bold text-blue-700">{new Date().toLocaleTimeString()}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 rounded-xl border border-white/50 shadow-sm" style={{ backgroundColor: 'rgba(255, 255, 255, 0.25)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                      <p className="text-[10px] text-gray-600 font-bold uppercase tracking-wider mb-1">Time</p>
                      <p className="text-lg font-bold text-gray-900">{formatTime(duration)}</p>
                    </div>
                    <div className="p-3 rounded-xl border border-white/50 shadow-sm" style={{ backgroundColor: 'rgba(255, 255, 255, 0.25)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                      <p className="text-[10px] text-gray-600 font-bold uppercase tracking-wider mb-1">Distance</p>
                      <p className="text-lg font-bold text-gray-900">{formatDistance(distance)}</p>
                    </div>
                    <div className="p-3 rounded-xl border border-blue-200/50 shadow-sm" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                      <p className="text-[10px] text-blue-700 font-bold uppercase tracking-wider mb-1">Speed</p>
                      <p className="text-lg font-bold text-blue-800">{speed}<span className="text-xs text-blue-600 ml-1">km/h</span></p>
                    </div>
                  </div>

                  <button 
                    onClick={handleStop}
                    className="w-full py-3.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-xl font-bold text-base transition-colors flex items-center justify-center gap-2 shadow-md shadow-red-500/20"
                  >
                    <Power className="w-5 h-5" />
                    Stop Recording
                  </button>
                </div>
              ) : lastTrip ? (
                <div className="space-y-4 animate-in fade-in">
                  <div className="rounded-xl p-4 border border-white/50 shadow-sm space-y-4" style={{ backgroundColor: 'rgba(255, 255, 255, 0.25)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
                    <div className="text-center border-b border-gray-300/40 pb-3">
                      <p className="text-xs text-blue-700 font-bold uppercase tracking-wider mb-1">Driver Name</p>
                      <p className="text-lg font-bold text-gray-900">
                        {lastTrip.driverName}
                      </p>
                      <p className="text-xs text-gray-600 font-medium mt-1">
                        {formatFullDate(lastTrip.startTime)}
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-sm border-b border-gray-200 pb-3">
                      <div>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Start Location</p>
                        <p className="font-semibold text-gray-800 text-xs truncate" title={`${lastTrip.startLocation[0].toFixed(5)}, ${lastTrip.startLocation[1].toFixed(5)}`}>
                          {lastTrip.startLocation[0].toFixed(4)}, {lastTrip.startLocation[1].toFixed(4)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">End Location</p>
                        <p className="font-semibold text-gray-800 text-xs truncate" title={`${lastTrip.endLocation[0].toFixed(5)}, ${lastTrip.endLocation[1].toFixed(5)}`}>
                          {lastTrip.endLocation[0].toFixed(4)}, {lastTrip.endLocation[1].toFixed(4)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Total Time</p>
                        <p className="font-bold text-gray-900">{formatTime(lastTrip.duration)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Distance</p>
                        <p className="font-bold text-gray-900">{formatDistance(lastTrip.distance)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Avg Speed</p>
                        <p className="font-bold text-gray-900">{lastTrip.duration > 0 ? Math.round(lastTrip.distance / (lastTrip.duration / 3600)) : 0} km/h</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setLastTrip(null)}
                      className="flex-1 py-3.5 bg-gray-900 hover:bg-black text-white rounded-xl font-bold text-base transition-colors flex items-center justify-center shadow-md"
                    >
                      Done
                    </button>
                    <button 
                      onClick={exportTripToPNG}
                      className="py-3.5 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold text-base transition-colors flex items-center justify-center shadow-sm"
                      title="Export PNG"
                    >
                      <ImageIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in">
                  <div className="p-4 rounded-xl border border-white/50 shadow-sm" style={{ backgroundColor: 'rgba(255, 255, 255, 0.25)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
                    <label htmlFor="driverName" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 ml-1">Driver Name</label>
                    <input 
                      type="text" 
                      id="driverName"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      placeholder="Enter your name..."
                      className="w-full px-4 py-3 rounded-xl border border-white/60 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-200/50 outline-none transition-all text-sm font-medium shadow-inner placeholder-gray-400/80"
                      style={{ backgroundColor: 'rgba(255, 255, 255, 0.35)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
                    />
                  </div>
                  <button 
                    onClick={handleStart}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-bold text-base transition-colors flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 mt-2"
                  >
                    <Navigation className="w-5 h-5" />
                    Start Recording
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'history' ? (
          <div className="flex-1 bg-gray-50 flex flex-col h-full overflow-hidden">
            <div className="bg-white p-6 md:p-8 border-b border-gray-200 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Trip History</h2>
                <p className="text-gray-500 mt-1">View your recorded trips.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="relative group">
                  <button className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-medium transition-colors flex items-center gap-2 shadow-sm shadow-blue-600/20">
                    <Download className="w-4 h-4" /> Save all data as...
                  </button>
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[1001] overflow-hidden py-1">
                    <button onClick={exportToCSV} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 hover:text-blue-700 text-sm text-gray-700 font-medium transition-colors flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" /> Download CSV
                    </button>
                    <button onClick={exportToXLSX} className="w-full text-left px-4 py-2.5 hover:bg-green-50 hover:text-green-700 text-sm text-gray-700 font-medium transition-colors flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-green-500" /> Download Excel
                    </button>
                    <button onClick={exportToJSON} className="w-full text-left px-4 py-2.5 hover:bg-yellow-50 hover:text-yellow-700 text-sm text-gray-700 font-medium transition-colors flex items-center gap-2">
                      <FileJson className="w-4 h-4 text-yellow-500" /> Download JSON
                    </button>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    if (window.confirm('Are you sure you want to clear all trip history?')) {
                      setTrips([]);
                      setLastTrip(null);
                    }
                  }} 
                  className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-medium transition-colors flex items-center gap-2 shadow-sm"
                >
                  Clear data
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              <div className="max-w-4xl mx-auto space-y-4">
                {trips.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 border-dashed">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No trips recorded yet.</p>
                  </div>
                ) : (
                  trips.map(trip => (
                    <div 
                      key={trip.id} 
                      onClick={() => {
                        setLastTrip(trip);
                        setActiveTab('home');
                        if (mapInstance) {
                          if (trip.path && trip.path.length > 1) {
                            const bounds = L.latLngBounds(trip.path);
                            // Set a timeout to allow the map container to resize if necessary
                            setTimeout(() => {
                              mapInstance.fitBounds(bounds, { padding: [50, 50], animate: true });
                            }, 100);
                          } else {
                            setTimeout(() => {
                              mapInstance.flyTo(trip.startLocation, 15, { animate: true });
                            }, 100);
                          }
                        }
                      }}
                      className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group"
                    >
                      <div className="flex-1 w-full">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
                            <Clock className="w-4 h-4 text-blue-500" />
                            <span>{new Date(trip.startTime).toLocaleDateString()} at {new Date(trip.startTime).toLocaleTimeString()}</span>
                          </div>
                          <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border border-gray-200">
                            {trip.driverName}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-4 mt-3">
                          <div className="bg-gray-50 px-3 py-2 rounded-lg flex-1">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-0.5">Total Time</p>
                            <p className="font-semibold text-gray-900 text-sm">{Math.floor(trip.duration / 60)}m {trip.duration % 60}s</p>
                          </div>
                          <div className="bg-blue-50 px-3 py-2 rounded-lg flex-1">
                            <p className="text-[10px] text-blue-600 uppercase tracking-wider font-bold mb-0.5">Distance</p>
                            <p className="font-semibold text-blue-700 text-sm">{formatDistance(trip.distance)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Delete this trip from history?')) {
                              setTrips(prev => prev.filter(t => t.id !== trip.id));
                              if (lastTrip?.id === trip.id) {
                                setLastTrip(null);
                                setTripImage(null);
                              }
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-10 h-10 rounded-full bg-red-50 text-red-500 hover:text-red-700 hover:bg-red-100 transition-all shrink-0 ml-2"
                          title="Delete trip"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <div className="hidden md:flex items-center justify-center w-10 h-10 rounded-full bg-gray-50 group-hover:bg-blue-50 text-gray-400 group-hover:text-blue-600 transition-colors shrink-0 ml-2">
                          <ChevronLeft className="w-5 h-5 rotate-180" />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-gray-50 flex flex-col h-full overflow-hidden">
            <div className="bg-white p-6 md:p-8 border-b border-gray-200 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
                  {previewType ? `Preview ${previewType.toUpperCase()}` : 'Export Data'}
                </h2>
                <p className="text-gray-500 mt-1">
                  {previewType ? 'Review your data before downloading.' : 'Download your trip history in various formats.'}
                </p>
              </div>
              {previewType && (
                <div className="flex gap-3">
                  <button 
                    onClick={() => setPreviewType(null)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors flex items-center gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button 
                    onClick={() => {
                      if (previewType === 'csv') exportToCSV();
                      if (previewType === 'xlsx') exportToXLSX();
                      if (previewType === 'json') exportToJSON();
                      if (previewType === 'png' && tripImage) exportTripToPNG();
                    }}
                    disabled={previewType === 'png' && !tripImage}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-medium transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <Download className="w-4 h-4" /> Download
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              {!previewType ? (
                <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button 
                    onClick={() => setPreviewType('csv')}
                    className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-row md:flex-col items-center justify-start md:justify-center gap-3 md:gap-4 hover:shadow-md hover:border-blue-200 transition-all group text-left md:text-center"
                  >
                    <div className="w-10 h-10 md:w-16 md:h-16 shrink-0 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FileText className="w-5 h-5 md:w-8 md:h-8" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm md:text-lg">Export CSV</h3>
                      <p className="text-[10px] md:text-sm text-gray-500">Standard table format</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => setPreviewType('xlsx')}
                    className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-row md:flex-col items-center justify-start md:justify-center gap-3 md:gap-4 hover:shadow-md hover:border-green-200 transition-all group text-left md:text-center"
                  >
                    <div className="w-10 h-10 md:w-16 md:h-16 shrink-0 bg-green-50 text-green-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FileSpreadsheet className="w-5 h-5 md:w-8 md:h-8" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm md:text-lg">Export Excel</h3>
                      <p className="text-[10px] md:text-sm text-gray-500">Microsoft Excel (.xlsx)</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => setPreviewType('json')}
                    className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-row md:flex-col items-center justify-start md:justify-center gap-3 md:gap-4 hover:shadow-md hover:border-yellow-200 transition-all group text-left md:text-center"
                  >
                    <div className="w-10 h-10 md:w-16 md:h-16 shrink-0 bg-yellow-50 text-yellow-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FileJson className="w-5 h-5 md:w-8 md:h-8" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm md:text-lg">Export JSON</h3>
                      <p className="text-[10px] md:text-sm text-gray-500">Developer raw data format</p>
                    </div>
                  </button>
                  
                  <button 
                    onClick={() => setPreviewType('png')}
                    className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-row md:flex-col items-center justify-start md:justify-center gap-3 md:gap-4 hover:shadow-md hover:border-purple-200 transition-all group text-left md:text-center"
                  >
                    <div className="w-10 h-10 md:w-16 md:h-16 shrink-0 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-5 h-5 md:w-8 md:h-8" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm md:text-lg">Export PNG</h3>
                      <p className="text-[10px] md:text-sm text-gray-500">Image map summary</p>
                    </div>
                  </button>
                </div>
              ) : (
                <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  {previewType === 'png' ? (
                    <div className="p-6 flex flex-col items-center justify-center bg-gray-50 min-h-[400px]">
                      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
                        {trips.filter(t => t.image).map(trip => (
                          <div key={trip.id} className="relative group bg-white p-3 rounded-2xl shadow-sm border border-gray-200">
                            <img src={trip.image} alt={`Trip ${trip.id}`} className="w-full h-auto rounded-xl" />
                            <div className="absolute top-5 right-5 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a href={trip.image} download={`trip-summary-${trip.id}.png`} className="bg-white p-2 text-blue-600 rounded-lg shadow-md hover:bg-blue-50">
                                <Download className="w-5 h-5"/>
                              </a>
                            </div>
                            <p className="text-center mt-3 text-sm font-medium text-gray-800 border-t border-gray-100 pt-3">
                              {trip.driverName} - {new Date(trip.startTime).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                      
                      {trips.filter(t => t.image).length === 0 && (
                        <div className="text-center text-gray-500 py-12">
                          <ImageIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                          <p>No trip images generated yet.</p>
                          <p className="text-sm mt-1">To generate images, go to History and click on any trip to render its map view.</p>
                        </div>
                      )}
                    </div>
                  ) : previewType === 'json' ? (
                    <pre className="p-6 bg-gray-900 text-green-400 text-sm overflow-x-auto font-mono">
                      {JSON.stringify(trips, null, 2)}
                    </pre>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                          <tr>
                            {['Driver Name', 'Start Time', 'End Time', 'Duration (mins)', 'Distance (km)', 'Start Lat', 'Start Lng', 'End Lat', 'End Lng'].map((h, i) => (
                              <th key={i} className="p-4 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {trips.map((t, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="p-4 whitespace-nowrap font-medium text-gray-900">{t.driverName}</td>
                              <td className="p-4 whitespace-nowrap">{new Date(t.startTime).toLocaleString()}</td>
                              <td className="p-4 whitespace-nowrap">{new Date(t.endTime).toLocaleString()}</td>
                              <td className="p-4 whitespace-nowrap">{(t.duration / 60).toFixed(1)}</td>
                              <td className="p-4 whitespace-nowrap">{t.distance.toFixed(2)}</td>
                              <td className="p-4 whitespace-nowrap">{t.startLocation[0].toFixed(6)}</td>
                              <td className="p-4 whitespace-nowrap">{t.startLocation[1].toFixed(6)}</td>
                              <td className="p-4 whitespace-nowrap">{t.endLocation[0].toFixed(6)}</td>
                              <td className="p-4 whitespace-nowrap">{t.endLocation[1].toFixed(6)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden bg-white border-t border-gray-200 flex items-center justify-around pb-safe z-[1000] shrink-0">
        <button 
          onClick={() => setActiveTab('home')}
          className={cn(
            "flex-1 flex flex-col items-center gap-1 py-3 transition-colors",
            activeTab === 'home' ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
          )}
        >
          <Home className="w-6 h-6" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Record</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={cn(
            "flex-1 flex flex-col items-center gap-1 py-3 transition-colors",
            activeTab === 'history' ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
          )}
        >
          <History className="w-6 h-6" />
          <span className="text-[10px] font-medium uppercase tracking-wider">History</span>
        </button>
        <button 
          onClick={() => setActiveTab('export')}
          className={cn(
            "flex-1 flex flex-col items-center gap-1 py-3 transition-colors",
            activeTab === 'export' ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
          )}
        >
          <Download className="w-6 h-6" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Export</span>
        </button>
      </nav>
    </div>
  );
}
