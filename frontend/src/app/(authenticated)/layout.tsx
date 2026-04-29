import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import ContextProvider from "@/components/ContextProvider";
import FeedbackButton from "@/components/FeedbackButton";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ContextProvider>
      <Sidebar />
      <div className="pl-64">
        <Topbar />
        <main className="p-6">{children}</main>
      </div>
      <FeedbackButton />
    </ContextProvider>
  );
}
