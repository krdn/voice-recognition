"use client";

interface Segment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

interface TranscriptViewProps {
  segments: Segment[];
  currentTime: number;
  onSeek: (time: number) => void;
}

const SPEAKER_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  SPEAKER_00: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", dot: "bg-blue-500" },
  SPEAKER_01: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-500" },
  SPEAKER_02: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", dot: "bg-amber-500" },
  SPEAKER_03: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", dot: "bg-red-500" },
};

const SPEAKER_LABELS: Record<string, string> = {
  SPEAKER_00: "화자 1",
  SPEAKER_01: "화자 2",
  SPEAKER_02: "화자 3",
  SPEAKER_03: "화자 4",
};

function getColor(speaker: string) {
  return SPEAKER_COLORS[speaker] || SPEAKER_COLORS.SPEAKER_00;
}

function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TranscriptView({
  segments,
  currentTime,
  onSeek,
}: TranscriptViewProps) {
  return (
    <div className="space-y-2">
      {segments.map((seg, i) => {
        const color = getColor(seg.speaker);
        const isActive = currentTime >= seg.start && currentTime < seg.end;

        return (
          <div
            key={i}
            className={`flex gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
              isActive
                ? `${color.bg} ${color.border} border`
                : "border-transparent hover:bg-gray-800/50"
            }`}
            onClick={() => onSeek(seg.start)}
          >
            {/* 화자 + 타임스탬프 */}
            <div className="flex flex-col items-center gap-1 min-w-[60px]">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${color.dot}`} />
                <span className={`text-xs font-medium ${color.text}`}>
                  {SPEAKER_LABELS[seg.speaker] || seg.speaker}
                </span>
              </div>
              <span className="text-[10px] text-gray-500 font-mono">
                {formatTimestamp(seg.start)}
              </span>
            </div>

            {/* 텍스트 */}
            <p
              className={`flex-1 text-sm leading-relaxed ${
                isActive ? "text-white" : "text-gray-300"
              }`}
            >
              {seg.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
