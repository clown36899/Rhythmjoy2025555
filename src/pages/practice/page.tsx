import { useState } from "react";
import PracticeRoomList from "../home/components/PracticeRoomList";
import SimpleHeader from "../../components/SimpleHeader";

export default function PracticeRoomsPage() {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortBy, setSortBy] = useState<"random" | "time" | "title" | "newest">("random");

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--page-bg-color)" }}>
      {/* Fixed Header */}
      <div
        className="fixed top-0 left-0 w-full z-30 border-b border-[#22262a]"
        style={{ backgroundColor: "var(--header-bg-color)" }}
      >
        <SimpleHeader title="연습실" />
      </div>

      {/* Practice Room List - 달력 없음 */}
      <div className="pt-16 pb-16">
        <PracticeRoomList
          adminType={null}
          showSearchModal={showSearchModal}
          setShowSearchModal={setShowSearchModal}
          showSortModal={showSortModal}
          setShowSortModal={setShowSortModal}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />
      </div>
    </div>
  );
}
