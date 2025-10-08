import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import PracticeRoomModal from "../../../components/PracticeRoomModal";

interface PracticeRoom {
  id: number;
  name: string;
  address: string;
  address_link: string;
  additional_link: string;
  images: string[];
  description: string;
  created_at?: string;
  additional_link_title?: string;
  location?: string;
  hourly_rate?: number;
  contact_info?: string;
  capacity?: number;
}

interface PracticeRoomListProps {
  isAdminMode: boolean;
}

export default function PracticeRoomList({ isAdminMode }: PracticeRoomListProps) {
  const [rooms, setRooms] = useState<PracticeRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("practice_rooms")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching practice rooms:", error);
        return;
      }

      const processedData = (data ?? []).map((room) => ({
        ...room,
        images:
          typeof room.images === "string"
            ? JSON.parse(room.images)
            : (room.images ?? []),
      })) as PracticeRoom[];

      setRooms(processedData);
    } catch (err) {
      console.error("Unexpected error while fetching rooms:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoomClick = () => {
    setShowModal(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        등록된 연습실이 없습니다
        {isAdminMode && (
          <div className="mt-4">
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              연습실 등록
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="px-4 py-6">
        {isAdminMode && (
          <div className="mb-4">
            <button
              onClick={() => setShowModal(true)}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              <i className="ri-add-line"></i>
              <span>연습실 등록</span>
            </button>
          </div>
        )}

        <div className="grid gap-4">
          {rooms.map((room) => (
            <div
              key={room.id}
              onClick={handleRoomClick}
              className="bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:bg-gray-750 transition-colors"
            >
              {room.images && room.images.length > 0 && (
                <div className="aspect-video w-full overflow-hidden">
                  <img
                    src={room.images[0]}
                    alt={room.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-4">
                <h3 className="text-lg font-semibold text-white mb-2">
                  {room.name}
                </h3>
                {room.address && (
                  <p className="text-sm text-gray-400 mb-2 flex items-start gap-2">
                    <i className="ri-map-pin-line mt-0.5"></i>
                    <span>{room.address}</span>
                  </p>
                )}
                {room.description && (
                  <p className="text-sm text-gray-300 line-clamp-2">
                    {room.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <PracticeRoomModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          fetchRooms();
        }}
        isAdminMode={isAdminMode}
      />
    </>
  );
}
