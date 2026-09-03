import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAppStore } from "../store/useAppStore";
import { ControlPanelHeader } from "../components/ControlPanelHeader";
import { TimerCard } from "../components/TimerCard";
import { TaskList } from "../components/TaskList";
import { PomodoroFooter } from "../components/PomodoroFooter";
import { SettingsModal } from "../components/SettingsModal";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const { tick, fetchTasks, token } = useAppStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Global 1-second interval for active timer ticking & Pomodoro
  useEffect(() => {
    const timer = setInterval(() => {
      tick();
    }, 1000);
    return () => clearInterval(timer);
  }, [tick]);

  // Initial task fetch on startup if token is present
  useEffect(() => {
    if (token) {
      fetchTasks();
    }
  }, [token, fetchTasks]);

  return (
    <div className="flex h-full w-full flex-col bg-background/95 backdrop-blur-xl border border-border/80 rounded-xl overflow-hidden shadow-2xl">
      {/* Native Control Panel Header */}
      <ControlPanelHeader onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* Main Panel Content Area */}
      <div className="flex flex-1 flex-col gap-3 p-3 overflow-hidden">
        {/* Time Tracking Widget */}
        <TimerCard />

        {/* Task Management Widget */}
        <TaskList />
      </div>

      {/* Pomodoro & Notifications Footer */}
      <PomodoroFooter />

      {/* ClickUp OAuth / Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
