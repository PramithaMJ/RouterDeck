import { ISPS } from "@/lib/isp";
import { IspLogo } from "./isp-badge";

export function IspStrip() {
  return (
    <section className="border-y border-subtle">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-7 sm:flex-row sm:items-center sm:gap-10 sm:px-6">
        <p className="label-caps shrink-0">Works with the router your provider gave you</p>
        <ul className="flex flex-wrap items-center gap-x-7 gap-y-3">
          {ISPS.map((isp) => (
            <li key={isp.id} className="flex items-center gap-2 text-[14px] font-medium">
              <IspLogo isp={isp} size="sm" />
              {isp.name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
