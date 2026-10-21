import React, { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import './fallen.css';
import {
  assignDialogueToShot,buildToonShotDrafts,selectToonShot,
  type ToonShotDraft,
} from './fallen-toon-shot-drafts';

type CharacterDraft = {
  id: string;
  name: string;
  role: string;
  description: string;
  photoName?: string;
  photoDataUrl?: string;
};

type StoryScene = {
  title: string;
  beat: string;
  visualPrompt: string;
  action: string;
  durationSec: number;
  dialogue: Array<{
    speakerId: string;
    text: string;
    emotion?: string;
  }>;
};

type EpisodeResponse = {
  success: boolean;
  data?: {
    story: {
      synopsis: string;
      theme: string;
      scenes: StoryScene[];
    };
    bible: any;
    seriesPlan: any;
    provider: {
      story: string;
      images: string;
      video: string;
    };
  };
  error?: string;
};

type ToonHandoffPacket = {
  schema:string;
  digest:string;
  state:string;
  deliveryReady:boolean;
  frameCount:number;
  shots:Array<{id:string;sceneIndex?:number}>;
};

const STYLE_OPTIONS = [
  'Warm 2D storybook cartoon',
  'Bright Saturday-morning cartoon',
  'Soft cinematic 3D animation',
  'Hand-painted watercolor animation',
  'Graphic-novel ink and color',
];

function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

async function resizeImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image.'));
    img.src = dataUrl;
  });

  const max = 1024;
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.84);
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

export default function FallenFamilyCartoon() {
  const [seriesTitle, setSeriesTitle] = useState('Our Family Cartoon');
  const [episodeTitle, setEpisodeTitle] = useState('Episode One');
  const [premise, setPremise] = useState('');
  const [style, setStyle] = useState(STYLE_OPTIONS[0]);
  const [characters, setCharacters] = useState<CharacterDraft[]>([
    { id: 'character-1', name: '', role: 'Parent', description: '' },
    { id: 'character-2', name: '', role: 'Parent', description: '' },
  ]);
  const [episode, setEpisode] = useState<EpisodeResponse['data'] | null>(null);
  const [selectedScene, setSelectedScene] = useState(0);
  const [characterSheet, setCharacterSheet] = useState<string>('');
  const [pilotFrame, setPilotFrame] = useState<string>('');
  const [pilotVideo, setPilotVideo] = useState<string>('');
  const [toonDrafts, setToonDrafts] = useState<ToonShotDraft[]>([]);
  const [selectedToonIndex, setSelectedToonIndex] = useState(0);
  const [toonHandoff, setToonHandoff] = useState<ToonHandoffPacket|null>(null);
  const [pilotFrameBinding, setPilotFrameBinding] = useState('');
  const [providerConsent, setProviderConsent] = useState(false);
  const [loading, setLoading] = useState<string>('');
  const [error, setError] = useState('');

  const activeCharacters = useMemo(
    () =>
      characters
        .filter((character) => character.name.trim())
        .map((character, index) => ({
          ...character,
          id: slugify(character.name, `character-${index + 1}`),
        })),
    [characters],
  );

  const selectedToonShot = selectToonShot(toonDrafts,selectedToonIndex);
  const selectedToonScene = selectedToonShot && episode
    ? episode.story.scenes[selectedToonShot.sceneIndex] : null;
  const shotBinding = toonHandoff && selectedToonShot
    ? toonHandoff.digest + ':' + selectedToonShot.id : '';

  function invalidateShotMedia() {
    setPilotFrame('');
    setPilotVideo('');
    setPilotFrameBinding('');
  }
  function invalidateToonPlan() {
    setToonHandoff(null);
    invalidateShotMedia();
  }
  function changeToonDraft(index:number,patch:Partial<ToonShotDraft>) {
    setToonDrafts(current=>current.map((shot,i)=>i===index?{...shot,...patch}:shot));
    invalidateToonPlan();
  }
  function changeToonActing(entityId:string,field:keyof ToonShotDraft['characters'][number]['acting'],value:string) {
    if (!selectedToonShot) return;
    changeToonDraft(selectedToonIndex,{
      characters:selectedToonShot.characters.map(actor=>actor.entityId===entityId
        ? {...actor,acting:{...actor.acting,[field]:value}}
        : actor),
    });
  }
  function chooseToonShot(index:number) {
    setSelectedToonIndex(index);
    invalidateShotMedia();
    const draft=selectToonShot(toonDrafts,index);
    if(draft) setSelectedScene(draft.sceneIndex);
  }
  function resetSeriesPlan() {
    setEpisode(null);
    setToonDrafts([]);
    setToonHandoff(null);
    invalidateShotMedia();
    setCharacterSheet('');
  }

  function updateCharacter(index: number, patch: Partial<CharacterDraft>) {
    if ('name' in patch || 'role' in patch || 'description' in patch) resetSeriesPlan();
    setCharacters((current) =>
      current.map((character, characterIndex) =>
        characterIndex === index ? { ...character, ...patch } : character,
      ),
    );
  }

  function addCharacter() {
    resetSeriesPlan();
    setCharacters((current) => [
      ...current,
      {
        id: `character-${current.length + 1}`,
        name: '',
        role: 'Family',
        description: '',
      },
    ]);
  }

  function removeCharacter(index: number) {
    resetSeriesPlan();
    setCharacters((current) => current.filter((_, characterIndex) => characterIndex !== index));
  }

  async function choosePhoto(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const photoDataUrl = await resizeImage(file);
      updateCharacter(index, { photoName: file.name, photoDataUrl });
      invalidateShotMedia();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare that photo.');
    }
  }

  async function buildEpisode(event: FormEvent) {
    event.preventDefault();
    setError('');
    resetSeriesPlan();

    if (!activeCharacters.length) {
      setError('Add at least one named character.');
      return;
    }
    if (premise.trim().length < 10) {
      setError('Give Fallen a little more of the episode idea.');
      return;
    }

    setLoading('episode');
    try {
      const response = await fetch('/api/fallen/family/episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seriesTitle,
          episodeTitle,
          premise,
          style,
          episodeNumber: 1,
          characters: activeCharacters.map(({ photoDataUrl, ...character }) => character),
        }),
      });
      const payload = (await response.json()) as EpisodeResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Fallen could not build the episode.');
      }
      setEpisode(payload.data);
      setToonDrafts(buildToonShotDrafts(payload.data));
      setSelectedToonIndex(0);
      setSelectedScene(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fallen could not build the episode.');
    } finally {
      setLoading('');
    }
  }

  async function generateCharacterSheet() {
    if (!providerConsent) {
      setError('Confirm the provider-photo notice before sending reference photos.');
      return;
    }
    const references = activeCharacters.filter((character) => character.photoDataUrl);
    if (!references.length) {
      setError('Add at least one reference photo first.');
      return;
    }

    setLoading('characters');
    setError('');
    try {
      const response = await fetch('/api/fallen/family/character-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent: true,
          seriesTitle,
          style,
          characters: references.map((character) => ({
            id: character.id,
            name: character.name,
            role: character.role,
            description: character.description,
            photoDataUrl: character.photoDataUrl,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.imageDataUrl) {
        throw new Error(payload.error || 'Character sheet generation failed.');
      }
      setCharacterSheet(payload.imageDataUrl);
      invalidateShotMedia();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Character sheet generation failed.');
    } finally {
      setLoading('');
    }
  }

  async function validateToonDirections() {
    if (!episode || !toonDrafts.length) {
      setError('Build an episode with video work orders first.');
      return;
    }
    setLoading('toon');
    setError('');
    invalidateToonPlan();
    try {
      const response=await fetch('/api/fallen/family/toon-handoff',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          bible:episode.bible,seriesPlan:episode.seriesPlan,
          shots:toonDrafts,fps:24,
        }),
      });
      const payload=await response.json();
      const packet=payload?.data?.handoff as ToonHandoffPacket|undefined;
      if(!response.ok || !payload.success || !packet ||
        packet.deliveryReady!==false || packet.shots.length!==toonDrafts.length ||
        packet.state!=='preproduction_work_orders_only') {
        throw new Error(payload.error||'Shot directions could not be validated.');
      }
      setToonHandoff(packet);
    }catch(err){
      setError(err instanceof Error?err.message:'Shot direction validation failed.');
    }finally{
      setLoading('');
    }
  }

  async function generatePilotFrame() {
    const scene=selectedToonScene;
    if (!toonHandoff || !selectedToonShot || !scene || !shotBinding) {
      setError('Validate the toon shot directions before making a keyframe.');
      return;
    }
    if (!providerConsent) {
      setError('Confirm the provider-photo notice before generating imagery.');
      return;
    }

    setLoading('frame');
    setError('');
    try {
      const response = await fetch('/api/fallen/family/scene-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent: true,
          seriesTitle,
          style,
          scene,
          toonHandoff,
          toonShotId:selectedToonShot.id,
          characterSheetDataUrl: characterSheet || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.imageDataUrl) {
        throw new Error(payload.error || 'Pilot frame generation failed.');
      }
      setPilotFrame(payload.imageDataUrl);
      setPilotFrameBinding(shotBinding);
      setPilotVideo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pilot frame generation failed.');
    } finally {
      setLoading('');
    }
  }

  async function generatePilotClip() {
    const scene=selectedToonScene;
    if (!scene || !pilotFrame || !toonHandoff || !selectedToonShot ||
      !shotBinding || pilotFrameBinding!==shotBinding) {
      setError('Generate a new keyframe using these validated shot directions first.');
      return;
    }
    if (!providerConsent) {
      setError('Confirm the provider-photo notice before generating video.');
      return;
    }

    setLoading('video');
    setError('');
    try {
      const start = await fetch('/api/fallen/family/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent: true,
          scene,
          style,
          toonHandoff,
          toonShotId:selectedToonShot.id,
          imageDataUrl: pilotFrame,
          aspectRatio: '16:9',
        }),
      });
      const started = await start.json();
      if (!start.ok || !started.success || !started.jobId) {
        throw new Error(started.error || 'Pilot video could not start.');
      }

      let attempts = 0;
      while (attempts < 72) {
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const status = await fetch(`/api/fallen/family/video/${encodeURIComponent(started.jobId)}`);
        const payload = await status.json();
        if (!status.ok || payload.status === 'failed') {
          throw new Error(payload.error || 'Pilot video generation failed.');
        }
        if (payload.status === 'ready' && payload.videoUrl) {
          setPilotVideo(payload.videoUrl);
          return;
        }
      }
      throw new Error('Video generation is still running. You can retry the pilot clip shortly.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pilot video generation failed.');
    } finally {
      setLoading('');
    }
  }

  const packagePayload = episode
    ? {
        schema: 'evercraft.fallen.family-cartoon-package.v1',
        seriesTitle,
        episodeTitle,
        style,
        premise,
        cast: activeCharacters.map(({ photoDataUrl, ...character }) => character),
        bible: episode.bible,
        story: episode.story,
        seriesPlan: episode.seriesPlan,
        toonHandoff:toonHandoff||null,
        toonShotDrafts:toonDrafts,
        generatedAssets: {
          characterSheetIncluded: Boolean(characterSheet),
          pilotFrameIncluded: Boolean(pilotFrame),
          pilotVideoIncluded: Boolean(pilotVideo),
        },
      }
    : null;

  return (
    <main className="fallen-app">
      <section className="fallen-hero fallen-shell">
        <a className="fallen-back" href="/">← Forge</a>
        <div className="fallen-kicker">FALLEN · FAMILY CARTOON QUICKSTART</div>
        <h1>Turn your family into a cartoon world.</h1>
        <p>
          Lock the cast once, give Fallen an episode idea, and build a reusable series bible,
          scene plan, dialogue package, character sheet, and pilot clip from one screen.
        </p>
        <div className="fallen-status-row">
          <span>Series continuity</span>
          <span>Character identity</span>
          <span>Episode planning</span>
          <span>Image department</span>
          <span>Experimental video department</span>
        </div>
      </section>

      <section className="fallen-shell fallen-grid">
        <form className="fallen-card fallen-form" onSubmit={buildEpisode}>
          <div className="fallen-section-title">1 · Build the world</div>

          <div className="fallen-two">
            <label>
              Series name
              <input value={seriesTitle} onChange={(event) => setSeriesTitle(event.target.value)} />
            </label>
            <label>
              Episode title
              <input value={episodeTitle} onChange={(event) => setEpisodeTitle(event.target.value)} />
            </label>
          </div>

          <label>
            Animation look
            <select value={style} onChange={(event) => setStyle(event.target.value)}>
              {STYLE_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          <div className="fallen-cast-head">
            <div>
              <strong>Cast</strong>
              <span>Reference photos stay local until you choose a generation action.</span>
            </div>
            <button type="button" className="fallen-secondary" onClick={addCharacter}>
              + Character
            </button>
          </div>

          <div className="fallen-cast-list">
            {characters.map((character, index) => (
              <article className="fallen-character" key={character.id + index}>
                <div className="fallen-photo">
                  {character.photoDataUrl ? (
                    <img src={character.photoDataUrl} alt="" />
                  ) : (
                    <span>PHOTO</span>
                  )}
                  <label className="fallen-upload">
                    Add photo
                    <input type="file" accept="image/*" onChange={(event) => choosePhoto(index, event)} />
                  </label>
                </div>
                <div className="fallen-character-fields">
                  <input
                    placeholder="Name"
                    value={character.name}
                    onChange={(event) => updateCharacter(index, { name: event.target.value })}
                  />
                  <input
                    placeholder="Role, e.g. Mom, Dad, Kid, Dog"
                    value={character.role}
                    onChange={(event) => updateCharacter(index, { role: event.target.value })}
                  />
                  <textarea
                    rows={2}
                    placeholder="Traits Fallen should preserve: hair, glasses, favorite hoodie, personality..."
                    value={character.description}
                    onChange={(event) => updateCharacter(index, { description: event.target.value })}
                  />
                </div>
                {characters.length > 1 && (
                  <button
                    type="button"
                    className="fallen-remove"
                    aria-label="Remove character"
                    onClick={() => removeCharacter(index)}
                  >
                    ×
                  </button>
                )}
              </article>
            ))}
          </div>

          <label>
            What happens in this episode?
            <textarea
              rows={5}
              value={premise}
              onChange={(event) => setPremise(event.target.value)}
              placeholder="Example: The family tries to build the world's greatest blanket fort, but the dog keeps stealing the pillows. Keep it funny, warm, and about working together."
            />
          </label>

          <button className="fallen-primary" disabled={Boolean(loading)}>
            {loading === 'episode' ? 'Directing episode…' : 'Build episode one'}
          </button>

          <label className="fallen-consent">
            <input
              type="checkbox"
              checked={providerConsent}
              onChange={(event) => setProviderConsent(event.target.checked)}
            />
            <span>
              I understand that when I press an image/video generation button, selected reference
              images and prompts are sent to the configured generation provider. Building the
              episode plan itself does not send the photos.
            </span>
          </label>

          {error && <div className="fallen-error">{error}</div>}
        </form>

        <aside className="fallen-card fallen-preview">
          <div className="fallen-section-title">2 · See the show</div>
          {!episode ? (
            <div className="fallen-empty">
              <div className="fallen-orb">F</div>
              <h2>Your episode appears here.</h2>
              <p>
                Start with names, a few reference photos, and one ridiculous family adventure.
                Fallen handles the continuity scaffolding underneath.
              </p>
            </div>
          ) : (
            <>
              <div className="fallen-summary">
                <span>EPISODE PACKAGE READY</span>
                <h2>{episodeTitle}</h2>
                <p>{episode.story.synopsis}</p>
                <small>Theme: {episode.story.theme}</small>
              </div>

              <div className="fallen-scenes">
                {episode.story.scenes.map((scene, index) => (
                  <button
                    type="button"
                    className={selectedScene === index ? 'fallen-scene active' : 'fallen-scene'}
                    key={scene.title + index}
                    onClick={() => {setSelectedScene(index);invalidateShotMedia();}}
                  >
                    <span>0{index + 1}</span>
                    <div>
                      <strong>{scene.title}</strong>
                      <small>{scene.beat} · {scene.durationSec}s</small>
                    </div>
                  </button>
                ))}
              </div>

              {episode.story.scenes[selectedScene] && (
                <article className="fallen-scene-detail">
                  <div className="fallen-section-title">Selected scene</div>
                  <h3>{episode.story.scenes[selectedScene].title}</h3>
                  <p>{episode.story.scenes[selectedScene].action}</p>
                  <pre>{episode.story.scenes[selectedScene].visualPrompt}</pre>
                  {episode.story.scenes[selectedScene].dialogue.map((line, index) => (
                    <blockquote key={line.speakerId + index}>
                      <strong>{line.speakerId}</strong>
                      <span>{line.text}</span>
                    </blockquote>
                  ))}
                </article>
              )}
            </>
          )}
        </aside>
      </section>

      {episode && (
        <section className="fallen-shell fallen-production">
          <div className="fallen-card">
            <div className="fallen-section-title">4 · Make it visual</div>
            <p className="fallen-toon-note">
              Media generation uses the selected validated shot, not an unreviewed generic prompt.
              Planned shots do not certify anatomy, identity, audio, or finished video.
            </p>
            <div className="fallen-actions-row">
              <button
                type="button"
                className="fallen-secondary"
                disabled={Boolean(loading)}
                onClick={generateCharacterSheet}
              >
                {loading === 'characters' ? 'Drawing cast…' : 'Generate character sheet'}
              </button>
              <button
                type="button"
                className="fallen-secondary"
                disabled={Boolean(loading) || !toonHandoff || !selectedToonShot}
                onClick={generatePilotFrame}
              >
                {loading === 'frame' ? 'Drawing frame…' : 'Generate selected scene'}
              </button>
              <button
                type="button"
                className="fallen-primary compact"
                disabled={Boolean(loading) || !pilotFrame || pilotFrameBinding!==shotBinding}
                onClick={generatePilotClip}
              >
                {loading === 'video' ? 'Animating pilot…' : 'Animate pilot clip'}
              </button>
            </div>

            <div className="fallen-media-grid">
              <figure>
                <figcaption>Character sheet</figcaption>
                {characterSheet ? <img src={characterSheet} alt="Generated family cartoon character sheet" /> : <div className="fallen-media-placeholder">CAST</div>}
              </figure>
              <figure>
                <figcaption>Selected scene</figcaption>
                {pilotFrame ? <img src={pilotFrame} alt="Generated pilot scene" /> : <div className="fallen-media-placeholder">FRAME</div>}
              </figure>
              <figure>
                <figcaption>Pilot clip</figcaption>
                {pilotVideo ? <video src={pilotVideo} controls playsInline /> : <div className="fallen-media-placeholder">VIDEO</div>}
              </figure>
            </div>

            <div className="fallen-package-row">
              <div>
                <strong>Production package</strong>
                <span>
                  Series bible, canon receipt, dialogue, scene prompts, and Saban-ready production needs.
                </span>
              </div>
              <button
                type="button"
                className="fallen-secondary"
                onClick={() =>
                  packagePayload &&
                  downloadJson(
                    `${slugify(seriesTitle, 'fallen-series')}-episode-1.json`,
                    packagePayload,
                  )
                }
              >
                Download package
              </button>
            </div>
          </div>
        </section>
      )}

      <footer className="fallen-shell fallen-footer">
        <span>Fallen by Evercraft</span>
        <span>World → canon → episode → production</span>
      </footer>
    </main>
  );
}
