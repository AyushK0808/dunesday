"use client";

import { useActionState, useState } from "react";
import { Flash, Submit } from "@/components/Submit";
import type { MovieSetting } from "@/lib/types";
import { saveSettings } from "../actions";

export function SettingsForm({ city, language, movies }: { city: string; language: string; movies: MovieSetting[] }) {
  const [state, action] = useActionState(saveSettings, null);
  const [adding, setAdding] = useState(false);
  const rows: (MovieSetting & { isNew?: boolean })[] = [
    ...movies,
    ...(adding ? [{ key: "new", name: "", url: "", enabled: true, theme: "plain" as const, isNew: true }] : []),
  ];
  return (
    <form action={action} className="form" style={{ maxWidth: "none" }}>
      <div className="inline-form">
        <div className="field">
          <label htmlFor="city">City</label>
          <input id="city" name="city" className="input" defaultValue={city} required pattern="[a-z\-]{2,40}" />
          <p className="hint">District's city slug, as in its URLs: hyderabad, bengaluru, delhi-ncr.</p>
        </div>
        <div className="field">
          <label htmlFor="language">Language</label>
          <input id="language" name="language" className="input" defaultValue={language} required />
          <p className="hint">Only shows in this language are tracked.</p>
        </div>
      </div>

      <fieldset>
        <legend className="legend">Films</legend>
        <p className="hint">Paste the film's District page link. Any city's link works; the city above is used. The BookMyShow link is optional; leave it empty to skip BookMyShow for that film.</p>
        <div className="movie-rows">
          {rows.map((m, i) => (
            <div key={m.key} className={`movie-row theme-${m.theme}`}>
              <input type="hidden" name="key" value={m.key} />
              <div className="field">
                <label htmlFor={`name-${i}`}>Name</label>
                <input id={`name-${i}`} name="name" className="input" defaultValue={m.name} placeholder="Film name" />
              </div>
              <div className="field">
                <label htmlFor={`url-${i}`}>District link</label>
                <input id={`url-${i}`} name="url" className="input" defaultValue={m.url} placeholder="https://www.district.in/movies/…-MV123456" inputMode="url" />
              </div>
              <div className="field">
                <label htmlFor={`bms-${i}`}>BookMyShow link</label>
                <input id={`bms-${i}`} name="bms_url" className="input" defaultValue={m.bms_url ?? ""} placeholder="https://in.bookmyshow.com/…/ET00123456" inputMode="url" />
              </div>
              <div className="field">
                <label htmlFor={`theme-${i}`}>Look</label>
                <select id={`theme-${i}`} name="theme" className="select" style={{ minHeight: 46, borderRadius: 12 }} defaultValue={m.theme}>
                  <option value="dune">Desert</option>
                  <option value="doom">Iron</option>
                  <option value="plain">Plain</option>
                </select>
              </div>
              <div className="row-actions">
                <label className="mini-check">
                  <input type="checkbox" name="enabled" value={m.key} defaultChecked={m.enabled} /> Track
                </label>
                {!m.isNew && (
                  <label className="mini-check">
                    <input type="checkbox" name="remove" value={m.key} /> Remove
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
        {!adding && (
          <div>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAdding(true)}>
              Add a film
            </button>
          </div>
        )}
      </fieldset>

      <div>
        <Submit pending="Saving…">Save settings</Submit>
        <Flash state={state} />
      </div>
    </form>
  );
}
