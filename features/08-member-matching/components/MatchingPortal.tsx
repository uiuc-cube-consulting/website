"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronRight, Compass, GraduationCap, Heart, LockKeyhole, Plus, Sparkles, Users, X } from "lucide-react";
import { EMPTY_PROFILE, INTERESTS, accepting, profileCompletion, sharedInterests, type Cycle, type MatchingData, type Profile, type Project, type Preference } from "../lib/model";

const inputClass = "mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10";
const cardClass = "rounded-2xl border border-[var(--border)] bg-white p-6 md:p-8";
const smallButton = "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--bg-cream)] disabled:opacity-40 disabled:cursor-not-allowed";

async function request(endpoint: string, method = "GET", body?: unknown) {
  const response = await fetch(endpoint, {
    method, headers: { "Content-Type": "application/json" }, cache: "no-store",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Could not confirm your changes. Please try again.");
  return result;
}
function message(error: unknown) { return error instanceof Error ? error.message : "Please try again."; }
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block text-sm font-semibold text-[var(--bg-dark)]">{label}{hint && <span className="mt-1 block text-xs font-normal text-[var(--muted)]">{hint}</span>}{children}</label>;
}
function Notice({ text, error = false }: { text: string; error?: boolean }) {
  return text ? <p role={error ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-[var(--border)] bg-[var(--bg-cream)] text-[var(--brand-deep)]"}`}>{text}</p> : null;
}
function InterestPicker({ selected, onChange, label = "Interests" }: { selected: string[]; onChange: (v: string[]) => void; label?: string }) {
  return <fieldset><legend className="text-sm font-semibold">{label}</legend><div className="mt-3 flex flex-wrap gap-2">{INTERESTS.map((interest) =>
    <button key={interest} type="button" aria-pressed={selected.includes(interest)}
      className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${selected.includes(interest) ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-[var(--border)] hover:border-[var(--brand)] text-[var(--muted)]"}`}
      onClick={() => onChange(selected.includes(interest) ? selected.filter((v) => v !== interest) : [...selected, interest])}>
      {selected.includes(interest) && <Check size={12} className="mr-1 inline" />}{interest}
    </button>)}</div></fieldset>;
}

export function MatchingPortal({ endpoint = "/api/project-matching" }: { endpoint?: string }) {
  const [data, setData] = useState<MatchingData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("profile");
  const [cycleId, setCycleId] = useState("");
  const load = useCallback(async () => {
    const result = await request(endpoint) as MatchingData;
    setData(result); setError("");
    return result;
  }, [endpoint]);
  useEffect(() => { let active = true; request(endpoint).then((v) => { if (active) setData(v); }).catch((e) => { if (active) setError(message(e)); }); return () => { active = false; }; }, [endpoint]);
  if (!data) return <div className="container-x py-14"><p className="eyebrow">Your CUBE profile</p><h1 className="mt-3 text-4xl">Profiles & project matching</h1><div className="mt-6"><Notice text={error || "Loading your profile…"} error={Boolean(error)} /></div>{error && <button className={`${smallButton} mt-4`} onClick={() => { void load().catch((e) => setError(message(e))); }}>Try again</button>}</div>;
  const exec = data.member.role === "exec";
  const cycle = data.cycles.find((c) => c.id === cycleId) ?? data.cycles.find((c) => c.status === "open") ?? data.cycles[0];
  const projects = data.projects.filter((p) => p.cycle_id === cycle?.id);
  const own = data.preferences.find((p) => p.member_id === data.member.id && p.cycle_id === cycle?.id);
  const matches = projects.filter((p) => sharedInterests(data.profile, p).length > 0).length;
  const completion = profileCompletion(data.profile);
  return <div className="container-x py-10 md:py-14">
    <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div><p className="eyebrow">Built around you</p><h1 className="mt-3 text-4xl md:text-5xl">Your interests. Your next project.</h1>
        <p className="mt-4 max-w-2xl text-[var(--muted)]">Tell us what you bring and what you want to learn. When projects open each semester, choose where you&rsquo;d like to contribute.</p></div>
      <div className="flex items-center gap-3 shrink-0"><span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--brand)] text-lg font-bold text-white">{(data.member.full_name || "C").slice(0, 1)}</span><div><p className="font-semibold">{data.member.full_name || data.member.email}</p><p className="text-xs text-[var(--muted)] capitalize">{data.member.role.replaceAll("_", " ")}{data.member.cohort && ` · ${data.member.cohort}`}</p></div></div>
    </div>
    <div className="mt-8 grid gap-3 sm:grid-cols-3">
      {[
        { icon: GraduationCap, label: "Profile completeness", value: `${completion}%`, detail: "Your story, skills & goals" },
        { icon: Heart, label: "Your interests", value: `${data.profile.interests.length} selected`, detail: "Carried forward every semester" },
        { icon: Compass, label: cycle?.name || "Next semester", value: cycle ? (own ? "Preferences saved" : accepting(cycle) ? "Projects open" : cycle.status === "draft" ? "In preparation" : "Preferences closed") : "Coming soon", detail: cycle ? `${matches} ${matches === 1 ? "project shares" : "projects share"} your interests` : "Exec will publish the project catalog" },
      ].map(({ icon: Icon, label, value, detail }) => <div key={label} className="flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-white p-5"><span className="rounded-xl bg-[var(--bg-cream)] p-3 text-[var(--brand)]"><Icon size={19} /></span><div><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-1 text-lg font-bold">{value}</p><p className="mt-1 text-xs text-[var(--muted)]">{detail}</p></div></div>)}
    </div>
    <nav aria-label="Profile sections" className="my-8 flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
      {[["profile", "My profile"], ["projects", "Project preferences"], ...(exec ? [["review", "Matching workspace"]] : [])].map(([key, title]) => <button type="button" key={key} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)} className={`rounded-full px-5 py-2.5 text-sm font-semibold ${tab === key ? "bg-[var(--bg-dark)] text-white" : "text-[var(--muted)] hover:bg-white"}`}>{title}</button>)}
    </nav>
    {tab === "profile" && <ProfileForm profile={data.profile} onSave={async (profile) => { await request(endpoint, "PUT", profile); await load(); }} />}
    {tab !== "profile" && <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <Field label="Semester"><select aria-label="Semester" value={cycle?.id ?? ""} className={`${inputClass} min-w-48`} onChange={(e) => setCycleId(e.target.value)}>
          {!data.cycles.length && <option value="">No semesters yet</option>}{data.cycles.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}
        </select></Field>
        {cycle && <p className="text-sm text-[var(--muted)]">{cycle.deadline ? `Deadline: ${new Date(cycle.deadline).toLocaleString()}` : "No deadline set"} · {cycle.status}</p>}
      </div>
      {tab === "projects" ? cycle ? <ProjectPreferences key={`${cycle.id}:${own?.updated_at ?? ""}`} cycle={cycle} projects={projects} profile={data.profile} preference={own}
        onSave={async (body) => { await request(endpoint, "POST", body); await load(); }} /> : <div className={cardClass}><Compass className="text-[var(--brand)]" /><h2 className="mt-4 text-2xl">Projects are on their way.</h2><p className="mt-2 text-[var(--muted)]">Complete your profile now. Your interests stay here until exec publish the next semester&rsquo;s catalog.</p></div>
        : <ExecWorkspace data={data} cycle={cycle} projects={projects} onAction={async (action) => { await request(endpoint, "PATCH", action); const next = await load(); if ((action as { action?: string }).action === "create_cycle") setCycleId(next.cycles[0]?.id ?? ""); }} />}
    </>}
  </div>;
}

function ProfileForm({ profile, onSave }: { profile: Profile; onSave: (v: Profile) => Promise<void> }) {
  const [draft, setDraft] = useState(profile);
  const [skills, setSkills] = useState(profile.skills.join(", "));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  function set<K extends keyof Profile>(key: K, value: Profile[K]) { setDraft((d) => ({ ...d, [key]: value })); setStatus(""); }
  return <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(""); setStatus(""); try { await onSave({ ...draft, skills: skills.split(",").map((v) => v.trim()).filter(Boolean) }); setStatus("Profile saved. Your interests will carry forward to future semesters."); } catch (e) { setError(message(e)); } finally { setBusy(false); } }} className="grid items-start gap-6 lg:grid-cols-3">
    <div className={`${cardClass} space-y-6 lg:col-span-2`}>
      <div><p className="eyebrow">01 / A little about you</p><h2 className="mt-2 text-2xl">More than a name on the roster.</h2><p className="mt-2 text-sm text-[var(--muted)]">Give leadership context for project matching and future opportunities.</p></div>
      <div className="grid gap-5 sm:grid-cols-2"><Field label="Major / field of study"><input className={inputClass} maxLength={120} value={draft.major} onChange={(e) => set("major", e.target.value)} placeholder="e.g. Information Sciences" /></Field><Field label="Graduation year"><input type="number" min={2000} max={2100} className={inputClass} value={draft.graduation_year ?? ""} onChange={(e) => set("graduation_year", e.target.value ? Number(e.target.value) : null)} placeholder="2028" /></Field></div>
      <Field label="About you" hint="A short introduction. What do you enjoy working on?"><textarea rows={3} maxLength={800} className={inputClass} value={draft.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Tell us a little about yourself…" /></Field>
      <Field label="Skills you bring" hint="Separate skills with commas. Up to 15, 60 characters each."><input className={inputClass} value={skills} onChange={(e) => { setSkills(e.target.value); setStatus(""); }} placeholder="e.g. Python, financial modeling, interviewing" /></Field>
      <InterestPicker selected={draft.interests} onChange={(v) => set("interests", v)} label="What are you interested in?" />
      <Field label="What do you want to learn?" hint="Think about skills, industries, or the kind of work you want to try."><textarea rows={3} maxLength={1000} className={inputClass} value={draft.learning_goals} onChange={(e) => set("learning_goals", e.target.value)} placeholder="This year, I’d like to get better at…" /></Field>
      <div className="grid gap-5 sm:grid-cols-2"><Field label="Personal website / portfolio" hint="Optional"><input type="url" className={inputClass} maxLength={300} value={draft.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" /></Field><Field label="LinkedIn" hint="Optional"><input type="url" className={inputClass} maxLength={300} value={draft.linkedin} onChange={(e) => set("linkedin", e.target.value)} placeholder="https://linkedin.com/in/…" /></Field></div>
      <fieldset className="space-y-4 rounded-xl bg-[var(--bg-cream)] p-5">
        <legend className="text-sm font-semibold">CUBE network & mentoring</legend>
        <p className="text-xs leading-relaxed text-[var(--muted)]">Your roster name and CUBE role appear in the members-only directory. Choose whether to share your major, skills, interests and LinkedIn. Your bio, learning goals and project preferences always stay private to you and exec.</p>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={draft.directory_visible} onChange={(e) => setDraft((d) => ({ ...d, directory_visible: e.target.checked, ...(!e.target.checked ? { open_to_mentor: false, share_email: false } : {}) }))} />Share my directory profile with CUBE members</label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" disabled={!draft.directory_visible} checked={draft.open_to_mentor} onChange={(e) => set("open_to_mentor", e.target.checked)} />I’m open to mentoring / coffee chats</label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" disabled={!draft.directory_visible} checked={draft.share_email} onChange={(e) => set("share_email", e.target.checked)} />Show my roster email to signed-in CUBE members</label>
        <p className="text-xs text-[var(--muted)]">Saving confirms these shared details are current. You can turn sharing off at any time. <a className="font-semibold text-[var(--brand)] underline" href="/portal/alumni">Visit the CUBE network →</a></p>
      </fieldset>
      <Notice text={error} error /><Notice text={status} /><button disabled={busy} className="btn btn-gold disabled:opacity-50">{busy ? "Saving…" : "Save profile"}<ArrowUpRight size={17} /></button>
    </div>
    <aside className={`${cardClass} space-y-5`}>
      <span className="inline-flex rounded-xl bg-[var(--bg-cream)] p-3 text-[var(--brand)]"><Sparkles size={22} /></span><h2 className="text-xl">A profile that grows with you.</h2>
      <p className="text-sm leading-relaxed text-[var(--muted)]">Your profile is ongoing. Project preferences are a fresh choice each semester—updating one never overwrites the other.</p>
      <div className="border-t border-[var(--border)] pt-5"><p className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole size={15} /> Who can see this?</p><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">You and exec. You can opt in to share selected details in the members-only directory. Project preferences and learning goals are never shared with other members, and nothing is published on the public website.</p></div>
      <p className="text-xs leading-relaxed text-[var(--muted)]">Completeness counts your major, graduation year, bio, skills, interests and learning goals. Links are always optional.</p>
    </aside>
  </form>;
}

function ProjectPreferences({ cycle, projects, profile, preference, onSave }: {
  cycle: Cycle; projects: Project[]; profile: Profile; preference?: Preference; onSave: (body: unknown) => Promise<void>;
}) {
  const [ranked, setRanked] = useState(preference?.ranked_project_ids ?? []);
  const [notes, setNotes] = useState(preference?.notes ?? "");
  const [hours, setHours] = useState(preference?.hours_per_week ?? 5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = accepting(cycle);
  const sorted = [...projects].sort((a, b) => sharedInterests(profile, b).length - sharedInterests(profile, a).length || a.title.localeCompare(b.title));
  function move(index: number, delta: number) { const next = [...ranked]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; setRanked(next); }
  return <div className="grid items-start gap-6 lg:grid-cols-3">
    <div className="lg:col-span-2">
      <div className="mb-5"><p className="eyebrow">02 / Find your fit</p><h2 className="mt-2 text-2xl">Explore this semester&rsquo;s projects.</h2><p className="mt-2 text-sm text-[var(--muted)]">Rank up to three. Shared-interest suggestions are based on your saved profile—not a placement decision.</p></div>
      {!open && <div className="mb-5"><Notice text={cycle.status === "draft" ? "This catalog is still a draft. Preferences open after exec publish it." : "Preferences are closed. You can still review your saved choices."} /></div>}
      <div className="space-y-4">{sorted.map((project) => {
        const shared = sharedInterests(profile, project);
        const rank = ranked.indexOf(project.id);
        return <article key={project.id} className={`${cardClass} ${rank >= 0 ? "ring-1 ring-[var(--brand)]" : ""}`}>
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{project.client || "CUBE engagement"}</p><h3 className="mt-2 text-xl">{project.title}</h3></div><span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--bg-cream)] px-3 py-1 text-xs"><Users size={13} />{project.capacity} seats</span></div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">{project.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">{project.tags.map((tag) => <span key={tag} className="rounded-full bg-[var(--bg-cream)] px-3 py-1 text-xs text-[var(--brand-deep)]">{tag}</span>)}</div>
          {shared.length > 0 && <p className="mt-4 flex items-start gap-2 text-xs text-[var(--brand)]"><Sparkles size={14} className="shrink-0" />Shared interests: {shared.join(", ")}</p>}
          <button className={`${smallButton} mt-5`} disabled={!open || busy || (rank < 0 && ranked.length >= 3)} onClick={() => setRanked(rank >= 0 ? ranked.filter((v) => v !== project.id) : [...ranked, project.id])}>{rank >= 0 ? <><Check size={14} />Choice #{rank + 1} · Remove</> : <><Plus size={14} />Add to preferences</>}</button>
        </article>;
      })}</div>
    </div>
    <form className={`${cardClass} space-y-5 lg:sticky lg:top-28`} onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(""); try { await onSave({ cycle_id: cycle.id, ranked_project_ids: ranked, notes, hours_per_week: hours }); } catch (e) { setError(message(e)); } finally { setBusy(false); } }}>
      <div><p className="eyebrow">Your shortlist</p><h2 className="mt-2 text-xl">Where do you want to go?</h2><p className="mt-2 text-xs text-[var(--muted)]">First choice at the top. {ranked.length}/3 selected.</p></div>
      <ol className="space-y-3">{ranked.map((id, i) => <li key={id} className="rounded-xl border border-[var(--border)] p-3"><div className="flex items-start gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-xs text-white">{i + 1}</span><span className="flex-1 text-sm font-semibold">{projects.find((p) => p.id === id)?.title || "Unavailable project"}</span></div><div className="mt-2 flex justify-end gap-1"><button type="button" aria-label={`Move choice ${i + 1} up`} className="rounded p-2 hover:bg-[var(--bg-cream)] disabled:opacity-30" disabled={!open || busy || i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button><button type="button" aria-label={`Move choice ${i + 1} down`} className="rounded p-2 hover:bg-[var(--bg-cream)] disabled:opacity-30" disabled={!open || busy || i === ranked.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button><button type="button" aria-label={`Remove choice ${i + 1}`} className="rounded p-2 hover:bg-[var(--bg-cream)] disabled:opacity-30" disabled={!open || busy} onClick={() => setRanked(ranked.filter((v) => v !== id))}><X size={14} /></button></div></li>)}</ol>
      {!ranked.length && <p className="rounded-xl bg-[var(--bg-cream)] p-4 text-sm text-[var(--muted)]">Add a project from the catalog to start your shortlist.</p>}
      <Field label="Available hours per week"><input type="number" min={1} max={40} required disabled={!open || busy} className={inputClass} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></Field>
      <Field label="Anything exec should know?" hint="Why these projects? Any specific goals or constraints?"><textarea rows={4} maxLength={1000} disabled={!open || busy} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Notice text={error} error />
      {preference && <p role="status" className="text-xs text-[var(--brand)]"><Check size={13} className="mr-1 inline" />Preferences saved · {new Date(preference.updated_at).toLocaleString()}</p>}
      <button disabled={!open || busy || !ranked.length} className="btn btn-gold w-full disabled:opacity-40">{busy ? "Saving…" : preference ? "Update preferences" : "Save preferences"}<ChevronRight size={15} /></button>
      <p className="text-xs leading-relaxed text-[var(--muted)]">You can revise until preferences close. Exec consider your choices, learning goals and team needs. Selecting a project does not reserve a seat.</p>
    </form>
  </div>;
}

function ExecWorkspace({ data, cycle, projects, onAction }: { data: MatchingData; cycle?: Cycle; projects: Project[]; onAction: (action: unknown) => Promise<void> }) {
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [capacity, setCapacity] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  async function act(action: unknown, success: string) {
    setBusy(true); setError(""); setStatus("");
    try { await onAction(action); setStatus(success); return true; } catch (e) { setError(message(e)); return false; } finally { setBusy(false); }
  }
  const members = (data.members ?? []).filter((m) => m.role !== "exec");
  const preferences = data.preferences.filter((p) => p.cycle_id === cycle?.id);
  const submitted = members.filter((m) => preferences.some((p) => p.member_id === m.id)).length;
  const visibleMembers = members.filter((m) => {
    const profile = data.profiles?.find((p) => p.member_id === m.id) ?? EMPTY_PROFILE;
    return `${m.full_name} ${m.email} ${profile.major} ${profile.skills.join(" ")}`.toLowerCase().includes(search.toLowerCase())
      && (!filter || profile.interests.includes(filter))
      && (!onlyMissing || !preferences.some((p) => p.member_id === m.id));
  });
  return <div className="space-y-6">
    <div><p className="eyebrow">Exec / Semester setup & matching</p><h2 className="mt-2 text-2xl">Understand the people behind the preferences.</h2><p className="mt-2 text-sm text-[var(--muted)]">Create a draft, add project briefs, then publish. Profiles persist across semesters; preferences never carry over. No automatic assignments or roster changes.</p></div>
    <Notice text={error} error /><Notice text={status} />
    <div className="grid items-start gap-6 lg:grid-cols-3">
      <form className={`${cardClass} space-y-4`} onSubmit={async (e) => { e.preventDefault(); if (await act({ action: "create_cycle", name, deadline: deadline ? new Date(deadline).toISOString() : null }, "Semester draft created. Add projects before publishing.")) { setName(""); setDeadline(""); } }}>
        <h3 className="text-lg">New semester</h3><Field label="Semester name"><input required maxLength={80} className={inputClass} placeholder="e.g. Spring 2027" value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Preference deadline" hint="Optional. Entered in your local time; shown in each viewer’s local time."><input type="datetime-local" className={inputClass} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field><button className={smallButton} disabled={busy}><Plus size={14} />Create draft</button>
      </form>
      <div className={`${cardClass} lg:col-span-2`}>
        {!cycle ? <p className="text-sm text-[var(--muted)]">Create the first semester to begin.</p> : <><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-lg">{cycle.name}</h3><p className="mt-2 text-sm text-[var(--muted)]">{projects.length} projects · {submitted}/{members.length} non-exec members responded</p></div>
          {cycle.status === "draft" && <button className={smallButton} disabled={busy || !projects.length} onClick={() => { if (window.confirm("Publish this catalog to all members? Project briefs will be frozen. Only one semester can be open at a time.")) void act({ action: "publish", cycle_id: cycle.id }, "Catalog published. Members can now rank projects."); }}>Publish catalog<ArrowUpRight size={14} /></button>}
          {cycle.status === "open" && <button className={smallButton} disabled={busy} onClick={() => { if (window.confirm("Close preferences now? Members will no longer be able to submit or revise choices. This cannot be undone in the portal.")) void act({ action: "close", cycle_id: cycle.id }, "Preferences closed. Saved responses remain available for review."); }}>Close preferences<LockKeyhole size={14} /></button>}
        </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">{projects.map((p) => <div key={p.id} className="rounded-xl bg-[var(--bg-cream)] p-4"><h4 className="text-sm">{p.title}</h4><p className="mt-2 text-xs text-[var(--muted)]">{p.capacity} seats · {preferences.filter((r) => r.ranked_project_ids[0] === p.id).length} first choices · {preferences.filter((r) => r.ranked_project_ids.includes(p.id)).length} total selections</p></div>)}</div>
          {cycle.status === "draft" && <form className="mt-6 space-y-4 border-t border-[var(--border)] pt-5" onSubmit={async (e) => { e.preventDefault(); if (await act({ action: "add_project", cycle_id: cycle.id, title, client, summary, tags, capacity }, "Project added to the draft.")) { setTitle(""); setClient(""); setSummary(""); setTags([]); } }}>
            <h4>Add a project brief</h4><div className="grid gap-4 sm:grid-cols-2"><Field label="Project title"><input required maxLength={120} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} /></Field><Field label="Client / organization"><input maxLength={120} className={inputClass} value={client} onChange={(e) => setClient(e.target.value)} /></Field></div>
            <Field label="Project brief"><textarea required maxLength={2000} rows={3} className={inputClass} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What will the team do, and what could members learn?" /></Field><InterestPicker selected={tags} onChange={setTags} label="Relevant interests" /><Field label="Planned team size"><input required type="number" min={1} max={30} className={inputClass} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} /></Field><button disabled={busy} className={smallButton}><Plus size={14} />Add project</button>
          </form>}
        </>}
      </div>
    </div>
    <div className={cardClass}>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h3 className="text-xl">Member interests & responses</h3><p className="mt-2 text-xs text-[var(--muted)]">All non-exec roster members are included. “No response” is not a statement of disinterest. Profiles are visible here even before projects are published.</p></div><span className="rounded-full bg-[var(--bg-cream)] px-4 py-2 text-xs">{visibleMembers.length} members shown</span></div>
      <div className="my-5 flex flex-wrap items-end gap-4"><div className="min-w-52 flex-1"><Field label="Find a member"><input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, major or skill" /></Field></div><Field label="Filter by interest"><select className={inputClass} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All interests</option>{INTERESTS.map((v) => <option key={v}>{v}</option>)}</select></Field><label className="flex items-center gap-2 py-3 text-sm"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />No response yet</label></div>
      <div className="space-y-3">{visibleMembers.map((member) => {
        const profile = data.profiles?.find((p) => p.member_id === member.id) ?? EMPTY_PROFILE;
        const preference = preferences.find((p) => p.member_id === member.id);
        return <details key={member.id} className="rounded-xl border border-[var(--border)] p-4"><summary className="cursor-pointer text-sm"><span className="font-semibold">{member.full_name || member.email}</span><span className="ml-3 text-xs text-[var(--muted)]">{profile.major || "Profile not completed"} · {preference ? `${preference.hours_per_week} hrs/week · submitted` : "No response yet"}</span></summary>
          <div className="mt-4 grid gap-5 text-sm md:grid-cols-2"><div className="space-y-3"><p className="text-xs text-[var(--muted)]">{member.email} · {member.role.replaceAll("_", " ")}{profile.graduation_year && ` · Class of ${profile.graduation_year}`}</p><p className="whitespace-pre-wrap">{profile.bio || "No bio yet."}</p><p><strong>Interests:</strong> {profile.interests.join(", ") || "Not added"}</p><p><strong>Skills:</strong> {profile.skills.join(", ") || "Not added"}</p><p className="whitespace-pre-wrap"><strong>Learning goals:</strong> {profile.learning_goals || "Not added"}</p><div className="flex gap-4">{[["Website", profile.website], ["LinkedIn", profile.linkedin]].filter(([, url]) => url).map(([label, url]) => <a className="text-[var(--brand)] underline" key={label} href={url} target="_blank" rel="noreferrer">{label}</a>)}</div></div><div><h4 className="mb-3">Semester preferences</h4>{preference ? <><ol className="list-inside list-decimal space-y-2">{preference.ranked_project_ids.map((id) => <li key={id}>{projects.find((p) => p.id === id)?.title ?? "Unavailable project"}</li>)}</ol><p className="mt-4 whitespace-pre-wrap text-[var(--muted)]">{preference.notes || "No additional notes."}</p><p className="mt-3 text-xs text-[var(--muted)]">Updated {new Date(preference.updated_at).toLocaleString()}</p></> : <p className="text-[var(--muted)]">No preferences submitted for this semester.</p>}</div></div>
        </details>;
      })}</div>
      {!visibleMembers.length && <p className="py-6 text-sm text-[var(--muted)]">No members match these filters.</p>}
    </div>
  </div>;
}
