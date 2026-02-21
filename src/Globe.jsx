import { useEffect, useRef, useState } from "react";
import Globe from "globe.gl";
import * as THREE from "three";

// ── Centroids [lng, lat] ─────────────────────────────────────────────────────
const CENTROIDS = {
  "China":                    [ 104.195,  35.861],
  "United States of America": [ -95.712,  37.090],
  "Brazil":                   [ -51.925, -14.235],
  "Germany":                  [  10.451,  51.165],
  "India":                    [  78.962,  20.593],
  "Russia":                   [ 105.318,  61.524],
  "Japan":                    [ 138.252,  36.204],
  "France":                   [   2.213,  46.227],
  "United Kingdom":           [  -3.436,  55.378],
  "Canada":                   [ -96.816,  56.130],
  "Australia":                [ 133.775, -25.274],
  "South Korea":              [ 127.766,  35.907],
  "Mexico":                   [-102.552,  23.634],
  "Indonesia":                [ 113.921,  -0.789],
  "Saudi Arabia":             [  45.079,  23.885],
  "Argentina":                [ -63.616, -38.416],
  "South Africa":             [  22.937, -30.559],
  "Nigeria":                  [   8.675,   9.082],
  "Egypt":                    [  30.802,  26.820],
  "Turkey":                   [  35.243,  38.963],
};

function centroid(name) { return CENTROIDS[name] ?? [0, 0]; }

// ── Math ─────────────────────────────────────────────────────────────────────
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const GR  = 100; // globe.gl internal radius

function toXYZ(lat, lng, alt = 0) {
  const r = GR * (1 + alt);
  const p = lat * D2R, l = lng * D2R;
  // globe.gl uses: x=cos(lat)cos(lng), y=sin(lat), z=-cos(lat)sin(lng)
  return new THREE.Vector3(
    r * Math.cos(p) * Math.cos(l),
    r * Math.sin(p),
   -r * Math.cos(p) * Math.sin(l)
  );
}

// Great-circle slerp, returns [lng, lat]
function slerp(fromLL, toLL, t) {
  const [lo1, la1] = fromLL, [lo2, la2] = toLL;
  const p1 = la1*D2R, l1 = lo1*D2R;
  const p2 = la2*D2R, l2 = lo2*D2R;
  const ax = Math.cos(p1)*Math.cos(l1), ay = Math.cos(p1)*Math.sin(l1), az = Math.sin(p1);
  const bx = Math.cos(p2)*Math.cos(l2), by = Math.cos(p2)*Math.sin(l2), bz = Math.sin(p2);
  const dot = Math.min(1, ax*bx + ay*by + az*bz);
  const O   = Math.acos(dot);
  if (Math.abs(O) < 1e-7) return fromLL;
  const s = Math.sin(O);
  const a = Math.sin((1-t)*O)/s, b = Math.sin(t*O)/s;
  const cx = a*ax+b*bx, cy = a*ay+b*by, cz = a*az+b*bz;
  return [Math.atan2(cy, cx)*R2D, Math.asin(cz)*R2D];
}

function arcAlt(t, peak=0.35) { return Math.sin(t*Math.PI)*peak; }
function eio(t) { return t<0.5 ? 2*t*t : -1+(4-2*t)*t; } // ease-in-out

// ── Arrowhead ────────────────────────────────────────────────────────────────
function arrowGeo() {
  const sh = new THREE.Shape();
  sh.moveTo(0, 1); sh.lineTo(-0.6, -0.6); sh.lineTo(0, -0.2); sh.lineTo(0.6, -0.6);
  sh.closePath();
  return new THREE.ShapeGeometry(sh);
}

// ════════════════════════════════════════════════════════════════════════════
export default function GlobeComponent() {
  const mountRef = useRef(null);
  const globeRef = useRef(null);
  const geoRef   = useRef(null);
  const seqRef   = useRef({ stop: false, raf: null });

  const [tradeData,    setTradeData]    = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [phase,        setPhase]        = useState("loading");
  const [status,       setStatus]       = useState("Loading…");

  // ── Load JSON ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/test.json")
      .then(r => r.json())
      .catch(() => [
        { country:"China",                    role:"exporter", material:"Silicon Wafers",        hs_code:"3818.00" },
        { country:"United States of America", role:"importer", material:"Lithium-ion Batteries", hs_code:"8507.60" },
        { country:"Brazil",                   role:"importer", material:"Refined Petroleum",      hs_code:"2710.12" },
      ])
      .then(raw => {
        const sorted = [...raw].sort((a,b) =>
          a.role==="exporter" && b.role!=="exporter" ? -1 :
          a.role!=="exporter" && b.role==="exporter" ?  1 : 0
        );
        setTradeData(sorted);
        setPhase("ready");
      });
  }, []);

  // ── Init Globe ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;

    const world = Globe()(mountRef.current)
      .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
      .bumpImageUrl("https://unpkg.com/three-globe/example/img/earth-topology.png")
      .backgroundColor("rgba(0,0,0,0)")
      .atmosphereColor("#1060ff")
      .atmosphereAltitude(0.20)
      .polygonsData([])
      .polygonAltitude(0.008)
      .polygonCapColor(d  => d.__cap  || "rgba(255,255,255,0.03)")
      .polygonSideColor(() => "rgba(80,150,255,0.04)")
      .polygonStrokeColor(() => "#1a4488")
      .labelsData([])
      .labelLat(d => d.lat).labelLng(d => d.lng).labelText(d => d.text)
      .labelSize(1.2).labelDotRadius(0.45).labelColor(d => d.color)
      .labelResolution(3).labelAltitude(0.015);

    world.renderer().setClearColor(0x000005, 1);

    // Lighting
    const sc = world.scene();
    sc.add(new THREE.AmbientLight(0x223355, 3.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(5,3,5); sc.add(sun);

    // Halo glow
    const gc = document.createElement("canvas");
    gc.width = gc.height = 512;
    const gx = gc.getContext("2d");
    const gr = gx.createRadialGradient(256,256,80,256,256,256);
    gr.addColorStop(0,   "rgba(20,100,255,0.22)");
    gr.addColorStop(0.5, "rgba(10,55,200,0.08)");
    gr.addColorStop(1,   "rgba(0,0,0,0)");
    gx.fillStyle = gr; gx.fillRect(0,0,512,512);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(gc),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    halo.scale.set(400, 400, 1); sc.add(halo);

    // ── Disable ALL automatic camera controls ──────────────────────────────
    // We will manually position camera every frame
    const ctrl = world.controls();
    ctrl.enabled       = false; // completely disable OrbitControls
    ctrl.autoRotate    = false;
    ctrl.enableDamping = false;

    globeRef.current = world;

    // Initial camera position: look at globe from the front
    const cam = world.camera();
    cam.position.set(0, 50, 280);
    cam.lookAt(0, 0, 0);

    // GeoJSON borders
    fetch("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson")
      .then(r => r.json())
      .then(geo => {
        geoRef.current = geo.features;
        world.polygonsData(geo.features);
      });

    return () => { if (mountRef.current) mountRef.current.innerHTML = ""; };
  }, []);

  // ── Sequence ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "ready" || tradeData.length < 2 || !globeRef.current) return;

    const world = globeRef.current;
    const seq   = { stop: false, raf: null };
    seqRef.current = seq;

    const ROLE = {
      exporter: { cap:"rgba(0,255,120,0.30)", label:"#00ff78" },
      importer: { cap:"rgba(0,160,255,0.30)", label:"#00b0ff" },
    };
    const ARC_MS   = 2600;
    const PAUSE_MS = 4000;

    // ── Camera helper: position camera above a lat/lng at given distance ────
    // No transitions, no controllers — direct matrix manipulation
    function positionCamera(lat, lng, dist) {
      const cam    = world.camera();
      const target = toXYZ(lat, lng, 0);        // point on globe surface
      const outDir = target.clone().normalize(); // outward normal
      cam.position.copy(outDir.multiplyScalar(dist));
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld(true);
    }

    // ── Smooth camera lerp over time (runs its own rAF loop) ────────────────
    function lerpCamera(fromLL, toLL, fromDist, toDist, ms) {
      return new Promise(resolve => {
        const start = performance.now();
        function tick(now) {
          if (seq.stop) return resolve();
          const raw = Math.min((now - start) / ms, 1);
          const t   = eio(raw);
          const [lng, lat] = slerp(fromLL, toLL, t);
          const dist = fromDist + (toDist - fromDist) * t;
          positionCamera(lat, lng, dist);
          if (raw < 1) seq.raf = requestAnimationFrame(tick);
          else resolve();
        }
        seq.raf = requestAnimationFrame(tick);
      });
    }

    // ── Highlight country polygons ───────────────────────────────────────────
    function highlight(name, role) {
      if (!geoRef.current) return;
      geoRef.current.forEach(f => {
        const n = f.properties.ADMIN || f.properties.NAME || "";
        f.__cap = n === name ? ROLE[role]?.cap : "rgba(255,255,255,0.03)";
      });
      world.polygonsData([...geoRef.current]);
    }

    function addLabel(lat, lng, text, color) {
      world.labelsData([...world.labelsData(), { lat:lat+4, lng, text, color }]);
    }

    // ── Build arc line objects ───────────────────────────────────────────────
    const MAX_PTS = 300;

    // Typed buffer so we never recreate geometry — just update DrawRange
    const positions = new Float32Array(MAX_PTS * 3);
    const lineGeo   = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    lineGeo.setDrawRange(0, 0);

    const lineMat  = new THREE.LineBasicMaterial({ color:0xffee00 ,linewidth: 0});
    const liveLine = new THREE.Line(lineGeo, lineMat);
    liveLine.frustumCulled = false;
    liveLine.visible = false;
    world.scene().add(liveLine);

    const arrowMat  = new THREE.MeshBasicMaterial({ color:0xffcc00, side:THREE.DoubleSide });
    const arrowMesh = new THREE.Mesh(arrowGeo(), arrowMat);
    arrowMesh.frustumCulled = false;
    arrowMesh.visible = false;
    world.scene().add(arrowMesh);

    // Add a permanent dim arc after animation finishes
    function bakePermanent(fromLL, toLL) {
      const N = 90, pts = [];
      for (let i=0;i<=N;i++) {
        const t = i/N;
        const [lng,lat] = slerp(fromLL, toLL, t);
        pts.push(toXYZ(lat, lng, arcAlt(t, 0.35)));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const m = new THREE.LineBasicMaterial({ color:0xff8800, opacity:0.2, transparent:true });
      world.scene().add(new THREE.Line(g, m));
    }

    // ── Animate arc: camera and line tip are always in sync ─────────────────
    function animateArc(fromEntry, toEntry) {
      return new Promise(resolve => {
        if (seq.stop) return resolve();

        const fromLL = centroid(fromEntry.country);
        const toLL   = centroid(toEntry.country);
        const N      = Math.min(MAX_PTS - 1, 140);

        // Pre-bake all arc points
        const arcPts = Array.from({ length: N+1 }, (_, i) => {
          const t         = i / N;
          const [lng, lat] = slerp(fromLL, toLL, t);
          const alt       = arcAlt(t, 0.35);
          return { lat, lng, alt, xyz: toXYZ(lat, lng, alt) };
        });

        // Reset buffer
        lineGeo.setDrawRange(0, 0);
        liveLine.visible  = true;
        arrowMesh.visible = true;

        let t0 = null;

        function frame(now) {
          if (seq.stop) return resolve();
          if (!t0) t0 = now;

          const raw = Math.min((now - t0) / ARC_MS, 1);
          const t   = eio(raw);
          const idx = Math.min(Math.floor(t * N), N);

          // ── Write points into typed buffer (no allocation) ────────────────
          for (let i = 0; i <= idx; i++) {
            const { xyz } = arcPts[i];
            positions[i*3+0] = xyz.x;
            positions[i*3+1] = xyz.y;
            positions[i*3+2] = xyz.z;
          }
          lineGeo.attributes.position.needsUpdate = true;
          lineGeo.setDrawRange(0, idx + 1);

          // ── Arrowhead at tip ──────────────────────────────────────────────
          const tip  = arcPts[idx];
          const prev = arcPts[Math.max(idx-1, 0)];
          const dir  = new THREE.Vector3().subVectors(tip.xyz, prev.xyz).normalize();
          const up   = tip.xyz.clone().normalize();
          const right = new THREE.Vector3().crossVectors(dir, up).normalize();
          const fwd   = new THREE.Vector3().crossVectors(up, right);
          arrowMesh.position.copy(tip.xyz);
          arrowMesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
          arrowMesh.scale.setScalar(GR * 0.032); // scaled to globe units

          // ── Camera locked to tip — NO relative motion ─────────────────────
          // Camera sits directly above the arc tip at a fixed altitude offset
          // We compute the outward unit vector at the tip and pull camera along it
          const camDist = GR * (1 + tip.alt * 2.8 + 1.55);
          positionCamera(tip.lat, tip.lng, camDist);

          if (raw < 1) {
            seq.raf = requestAnimationFrame(frame);
          } else {
            resolve();
          }
        }

        seq.raf = requestAnimationFrame(frame);
      });
    }

    // ── promise-based sleep ──────────────────────────────────────────────────
    function wait(ms) {
      return new Promise(res => {
        const id = setTimeout(res, ms);
        seq._tid = id;
      });
    }

    // ── Main sequence ────────────────────────────────────────────────────────
    async function run() {
      const first      = tradeData[0];
      const firstLL    = centroid(first.country);
      const [fLng,fLat] = firstLL;

      setCurrentIndex(0);
      setStatus(`Flying to ${first.country}…`);
      highlight(first.country, first.role);

      // Fly camera to first country
      const startLL   = [0, 20];
      const startDist = GR * 2.85;
      const endDist   = GR * 1.80;
      await lerpCamera(startLL, firstLL, startDist, endDist, 2200);
      if (seq.stop) return;

      addLabel(fLat, fLng,
        `${first.role==="exporter"?"📤":"📥"} ${first.country}`,
        ROLE[first.role]?.label || "#fff"
      );

      await wait(900);
      if (seq.stop) return;

      // Arc loop
      for (let i = 0; i < tradeData.length - 1; i++) {
        if (seq.stop) return;

        const fromE  = tradeData[i];
        const toE    = tradeData[i+1];
        const toLL   = centroid(toE.country);
        const [toLng, toLat] = toLL;

        setStatus(`${fromE.country}  ──▶  ${toE.country}`);
        setCurrentIndex(i);

        // Draw arc with camera tracking tip
        await animateArc(fromE, toE);
        if (seq.stop) return;

        // Bake dim permanent trail
        bakePermanent(centroid(fromE.country), toLL);

        // Hide live arc
        liveLine.visible  = false;
        arrowMesh.visible = false;
        lineGeo.setDrawRange(0, 0);

        // Highlight destination
        highlight(toE.country, toE.role);
        setCurrentIndex(i+1);

        addLabel(toLat, toLng,
          `${toE.role==="exporter"?"📤":"📥"} ${toE.country}`,
          ROLE[toE.role]?.label || "#fff"
        );

        // Ease camera back slightly to show country
        const curDist = GR * (1 + arcAlt(1,0.35)*2.8 + 1.55); // dist at end of arc
        await lerpCamera(toLL, toLL, curDist, GR*1.80, 600);
        if (seq.stop) return;

        setStatus(`${toE.country} — ${toE.material}`);
        await wait(PAUSE_MS);
        if (seq.stop) return;
      }

      setPhase("done");
      setStatus("All trade routes mapped.");
    }

    run();

    return () => {
      seq.stop = true;
      if (seq.raf) cancelAnimationFrame(seq.raf);
      if (seq._tid) clearTimeout(seq._tid);
    };
  }, [phase, tradeData]);

  // ── UI ─────────────────────────────────────────────────────────────────────
  const cur = tradeData[currentIndex] ?? null;
  const rs  = cur?.role === "exporter"
    ? { text:"#00ff78", border:"rgba(0,255,120,0.4)", bg:"rgba(0,255,120,0.07)" }
    : { text:"#00b0ff", border:"rgba(0,160,255,0.4)", bg:"rgba(0,160,255,0.07)" };

  return (
    <div style={{ width:"100vw", height:"100vh", background:"#000005", position:"relative", overflow:"hidden" }}>
      <div ref={mountRef} style={{ width:"100%", height:"100%" }} />

      {/* Title */}
      <div style={{
        position:"absolute", top:22, left:"50%", transform:"translateX(-50%)",
        fontFamily:"'Courier New',monospace", color:"#4a9fff", fontSize:13,
        letterSpacing:"0.22em", textTransform:"uppercase",
        textShadow:"0 0 14px #4a9fff88", userSelect:"none", whiteSpace:"nowrap",
      }}>
        ⬡ &nbsp; Global Trade Flow Visualizer &nbsp; ⬡
      </div>

      {/* Progress bar */}
      {tradeData.length > 1 && (
        <div style={{
          position:"absolute", top:52, left:"50%", transform:"translateX(-50%)",
          width:280, height:2, background:"rgba(255,255,255,0.07)", borderRadius:2,
        }}>
          <div style={{
            height:"100%",
            width:`${((currentIndex+1)/tradeData.length)*100}%`,
            background:"linear-gradient(90deg,#00ff78,#00b0ff)",
            borderRadius:2, transition:"width 0.5s ease",
            boxShadow:"0 0 10px #00b0ff88",
          }}/>
        </div>
      )}

      {/* Status */}
      <div style={{
        position:"absolute", top:63, left:"50%", transform:"translateX(-50%)",
        fontFamily:"'Courier New',monospace", fontSize:11,
        color:"rgba(120,180,255,0.5)", letterSpacing:"0.12em", whiteSpace:"nowrap",
      }}>
        {status}
      </div>

      {/* Country card */}
      {cur && (
        <div key={currentIndex} style={{
          position:"absolute", bottom:38, left:38,
          background:rs.bg, border:`1px solid ${rs.border}`,
          borderRadius:12, padding:"16px 22px",
          fontFamily:"'Courier New',monospace", color:"#fff",
          backdropFilter:"blur(10px)",
          boxShadow:`0 0 28px ${rs.border}`, minWidth:230,
          animation:"fadeUp 0.4s ease",
        }}>
          <div style={{ color:rs.text, fontSize:17, fontWeight:"bold", marginBottom:3 }}>
            {cur.country}
          </div>
          <div style={{ color:"#777", fontSize:10, letterSpacing:"0.18em", marginBottom:8 }}>
            {cur.role.toUpperCase()} &nbsp;·&nbsp; HS {cur.hs_code}
          </div>
          <div style={{ color:"#ddd", fontSize:13 }}>{cur.material}</div>
        </div>
      )}

      {/* Step counter */}
      <div style={{
        position:"absolute", bottom:38, right:38,
        fontFamily:"'Courier New',monospace",
        color:"rgba(100,170,255,0.45)", fontSize:12,
        letterSpacing:"0.1em", textAlign:"right",
      }}>
        {phase==="done" ? "✓  ALL ROUTES MAPPED"
          : tradeData.length > 0
            ? `STOP ${Math.min(currentIndex+1,tradeData.length)} / ${tradeData.length}`
            : ""}
      </div>

      {/* Legend */}
      <div style={{
        position:"absolute", top:86, right:28,
        fontFamily:"'Courier New',monospace", fontSize:11,
        color:"#555", lineHeight:"22px",
      }}>
        <div><span style={{color:"#00ff78"}}>█</span> Exporter</div>
        <div><span style={{color:"#00b0ff"}}>█</span> Importer</div>
        <div><span style={{color:"#ffee00"}}>——▶</span> Route</div>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(12px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </div>
  );
}