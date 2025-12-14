import { createFileRoute } from '@tanstack/react-router'
import {mainAtom} from "@/components/MainFramework.tsx";
import {useSetAtom} from "jotai";
import {useEffect} from "react";

export const Route = createFileRoute('/_home/todo')({
  component: RouteComponent,
})

function RouteComponent() {
  const setMainFramework = useSetAtom(mainAtom);

  useEffect(() => {
    setMainFramework((prev) => ({
      ...prev,
      ...{
        tabBarVisible: true,
        activeTab: 'todo',
        navbarVisible: false,
      },
    }));
  }, []);

  return <div>Hello "/_home/todo"!</div>
}
