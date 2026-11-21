"use client";

import { useActionState } from "react";
import { Flash, Submit } from "@/components/Submit";
import { savePrefs } from "../actions";

type Props = {
  name: string;
  email: string;
  prefs: { alerts_on: boolean; movies: string[]; formats: string[] };
  movies: { key: string; name: string; theme: string }[];
  formats: string[];
};

export function PrefsForm({ name, email, prefs, movies, formats }: Props) {
  const [state, action] = useActionState(savePrefs, null);
  const allMovies = prefs.movies.length === 0;
  return (
    <form action={action} className="form">
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" className="input" defaultValue={name} maxLength={60} autoComplete="name" />
        <p className="hint">Alerts go to {email}.</p>
      </div>

      <label className="switch">
        <input type="checkbox" name="alerts_on" defaultChecked={prefs.alerts_on} />
        <span className="track" aria-hidden="true" />
        <span>Email me when new showtimes appear</span>
      </label>

      <fieldset>
        <legend className="legend">Films</legend>
        <div className="checks">
          {movies.map((m) => (
            <label key={m.key} className={`check theme-${m.theme}`}>
              <input type="checkbox" name="movies" value={m.key} defaultChecked={allMovies || prefs.movies.includes(m.key)} />
              <span className="tick" aria-hidden="true" />
              {m.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="legend">Formats</legend>
        <p className="hint">Leave all unticked to get every format. Tick some to only hear about shows in at least one of them.</p>
        <div className="checks">
          {formats.map((t) => (
            <label key={t} className="check">
              <input type="checkbox" name="formats" value={t} defaultChecked={prefs.formats.includes(t)} />
              <span className="tick" aria-hidden="true" />
              {t}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Submit pending="Saving…">Save alert preferences</Submit>
        <Flash state={state} />
      </div>
    </form>
  );
}
