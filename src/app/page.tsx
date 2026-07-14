"use client";

import { useState } from "react";
import CalendarPanel from "@/components/CalendarPanel";
import RobotPanel from "@/components/RobotPanel";
import TemplatePanel from "@/components/TemplatePanel";
import PushTimePanel from "@/components/PushTimePanel";
import MembersPanel from "@/components/MembersPanel";
import PushLogsPanel from "@/components/PushLogsPanel";
import { Calendar, Bot, MessageSquare, Clock, Users, FileText } from "lucide-react";

const tabs = [
  { key: "calendar", label: "发版日历", icon: Calendar },
  { key: "robot", label: "机器人", icon: Bot },
  { key: "template", label: "消息模板", icon: MessageSquare },
  { key: "pushtime", label: "推送时间", icon: Clock },
  { key: "members", label: "@成员", icon: Users },
  { key: "logs", label: "推送日志", icon: FileText },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("calendar");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">迭代需求群消息自动通知系统</h1>
      </header>

      {/* Tab Navigation */}
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "calendar" && <CalendarPanel />}
      {activeTab === "robot" && <RobotPanel />}
      {activeTab === "template" && <TemplatePanel />}
      {activeTab === "pushtime" && <PushTimePanel />}
      {activeTab === "members" && <MembersPanel />}
      {activeTab === "logs" && <PushLogsPanel />}
    </div>
  );
}
