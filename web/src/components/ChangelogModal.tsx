import { useEffect } from "react";
import { X, Sparkle, Rocket, Bug, Check } from "@phosphor-icons/react";
import { CHANGELOG } from "@/data/changelog";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ChangelogModal({ open, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Version History &amp; Changelog
            </h2>
            <p className="text-sm text-muted mt-1">
              Track all major updates and improvements to the application
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg border border-border hover:bg-bg-elevated text-muted hover:text-white transition-colors"
            aria-label="Close changelog"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-8">
          {CHANGELOG.map((entry, i) => (
            <div
              key={entry.version}
              className={
                i < CHANGELOG.length - 1 ? "pb-6 border-b border-border" : ""
              }
            >
              <div className="flex items-baseline gap-3 mb-1 flex-wrap">
                {entry.tag && (
                  <span className="px-2 py-0.5 rounded-md bg-accent/15 border border-accent/30 text-accent text-[10px] font-bold tracking-wider">
                    {entry.tag}
                  </span>
                )}
                <span className="text-lg font-semibold text-white">
                  {entry.version}
                </span>
              </div>
              <div className="text-xs text-muted mb-4">{entry.date}</div>

              {entry.features && entry.features.length > 0 && (
                <Section
                  icon={<Sparkle size={16} weight="fill" className="text-emerald-400" />}
                  title="Features"
                  titleColor="text-emerald-400"
                  items={entry.features}
                  bullet={<Check size={14} weight="bold" className="text-emerald-400 mt-1 shrink-0" />}
                />
              )}

              {entry.improvements && entry.improvements.length > 0 && (
                <Section
                  icon={<Rocket size={16} weight="fill" className="text-sky-400" />}
                  title="Improvements"
                  titleColor="text-sky-400"
                  items={entry.improvements}
                  bullet={<span className="text-sky-400 mt-0.5 shrink-0">↑</span>}
                />
              )}

              {entry.fixes && entry.fixes.length > 0 && (
                <Section
                  icon={<Bug size={16} weight="fill" className="text-amber-400" />}
                  title="Fixes"
                  titleColor="text-amber-400"
                  items={entry.fixes}
                  bullet={<span className="text-amber-400 mt-0.5 shrink-0">●</span>}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  titleColor: string;
  items: string[];
  bullet: React.ReactNode;
}

function Section({ icon, title, titleColor, items, bullet }: SectionProps) {
  return (
    <div className="mt-3">
      <div className={`flex items-center gap-2 mb-2 font-semibold ${titleColor}`}>
        {icon}
        <span>{title}</span>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm text-slate-300 leading-relaxed"
          >
            {bullet}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
