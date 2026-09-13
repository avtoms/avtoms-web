"use client";
// The page header is drawn by the owner layout — a bar across the top of the content — but
// what it says belongs to the page: a title, a line of context beside it ("7 xizmat · 5
// toifa"), and the page's own buttons on the right. A page declares those with <PageHeader>,
// which portals them into the layout's slots. That way no page rebuilds the bar, and the bar
// never has to know anything about the page under it.
import React, { createContext, useContext, useEffect } from "react";
import { createPortal } from "react-dom";

export type PageHeaderSlots = {
  title: HTMLElement | null;
  meta: HTMLElement | null;
  actions: HTMLElement | null;
  // A page that brings its own title hides the layout's default one (the nav item's name).
  setCustomTitle: (on: boolean) => void;
};

const Ctx = createContext<PageHeaderSlots | null>(null);

export function PageHeaderProvider({ value, children }: { value: PageHeaderSlots; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function PageHeader({ title, meta, actions }: { title?: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode }) {
  const slots = useContext(Ctx);
  const setCustomTitle = slots?.setCustomTitle;
  const hasTitle = title !== undefined && title !== null;
  useEffect(() => {
    if (!setCustomTitle || !hasTitle) return;
    setCustomTitle(true);
    return () => setCustomTitle(false);
  }, [setCustomTitle, hasTitle]);
  if (!slots) return null;
  return (
    <>
      {hasTitle && slots.title && createPortal(title, slots.title)}
      {meta && slots.meta && createPortal(meta, slots.meta)}
      {actions && slots.actions && createPortal(actions, slots.actions)}
    </>
  );
}
