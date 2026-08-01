import{j as e,r as u,e as M,u as R,t as I,p as L}from"./index-3EfZUfvR.js";import{u as w}from"./useQuery-DOmiqr9n.js";import{g as z,f as y,S,c as F,a as Y,b as X}from"./malSeason-DREEhUz8.js";const E=[{glow:"#FFD700"},{glow:"#42A5F5"},{glow:"#F48FB1"},{glow:"#00C853"},{glow:"#B3E5FC"},{glow:"#FF1744"},{glow:"#CE93D8"},{glow:"#FF006E"},{glow:"#CFD8DC"},{glow:"#00E5FF"}],_=`
/* === Luxury flowing gradient border + accents — dipakai AnimeCard & Seasons === */
@keyframes lux-flow{0%,100%{background-position:0% 50%}33%{background-position:66% 0%}66%{background-position:100% 50%}}
@keyframes lux-glow-pulse{0%,100%{opacity:1}50%{opacity:.72}}
.lux-wrap{border-radius:14px;padding:2.5px;background-size:400% 400%;position:relative}
.lux-v0{background:linear-gradient(135deg,#8B6914,#FFD700,#FFA500,#FFEC00,#FFF8B2,#FFA500,#B8860B,#FFD700);box-shadow:0 0 16px rgba(255,215,0,.7),0 0 36px rgba(255,165,0,.45),0 0 64px rgba(255,100,0,.22),0 0 90px rgba(255,200,0,.1);animation:lux-flow 4s ease-in-out infinite}
.lux-v1{background:linear-gradient(135deg,#0D47A1,#1E88E5,#42A5F5,#E3F2FD,#90CAF9,#1565C0,#0D47A1,#42A5F5);box-shadow:0 0 16px rgba(30,136,229,.72),0 0 36px rgba(13,71,161,.48),0 0 64px rgba(30,136,229,.22),0 0 90px rgba(66,165,245,.1);animation:lux-flow 3s ease-in-out infinite}
.lux-v2{background:linear-gradient(135deg,#880E4F,#F48FB1,#FCE4EC,#FFD54F,#F8BBD0,#AD1457,#F48FB1,#FFD54F);box-shadow:0 0 16px rgba(244,143,177,.68),0 0 34px rgba(255,213,79,.42),0 0 60px rgba(233,30,99,.2),0 0 88px rgba(255,213,79,.1);animation:lux-flow 4.5s ease-in-out infinite}
.lux-v3{background:linear-gradient(135deg,#1B5E20,#00C853,#69F0AE,#00E5FF,#80CBC4,#00695C,#00C853,#69F0AE);box-shadow:0 0 16px rgba(0,200,83,.68),0 0 34px rgba(0,229,255,.42),0 0 60px rgba(0,150,60,.22),0 0 88px rgba(0,229,255,.1);animation:lux-flow 3.5s ease-in-out infinite}
.lux-v4{background:linear-gradient(135deg,#90CAF9,#E3F2FD,#FFFFFF,#B3E5FC,#FFFFFF,#BBDEFB,#E3F2FD,#FFFFFF);box-shadow:0 0 12px rgba(179,229,252,.65),0 0 28px rgba(255,255,255,.45),0 0 52px rgba(144,202,249,.22),0 0 80px rgba(179,229,252,.1);animation:lux-flow 5.5s ease-in-out infinite}
.lux-v5{background:linear-gradient(135deg,#7F0000,#FF1744,#FF6D00,#FF8F00,#FF1744,#B71C1C,#FF1744,#FF6D00);box-shadow:0 0 18px rgba(255,23,68,.78),0 0 40px rgba(255,109,0,.52),0 0 70px rgba(183,28,28,.3),0 0 100px rgba(255,23,68,.12);animation:lux-flow 2.5s ease-in-out infinite}
.lux-v6{background:linear-gradient(135deg,#4A148C,#7B1FA2,#CE93D8,#E040FB,#BA68C8,#6A1B9A,#CE93D8,#E040FB);box-shadow:0 0 16px rgba(171,71,188,.7),0 0 36px rgba(206,147,216,.45),0 0 64px rgba(74,20,140,.25),0 0 90px rgba(206,147,216,.1);animation:lux-flow 4s ease-in-out infinite}
.lux-v7{background:linear-gradient(135deg,#FF006E,#FF6B00,#FFD700,#00E676,#00E5FF,#7C4DFF,#FF006E,#FF6B00);box-shadow:0 0 16px rgba(255,0,110,.65);box-shadow:0 0 34px rgba(0,229,255,.42),0 0 60px rgba(124,77,255,.25),0 0 88px rgba(255,0,110,.1);animation:lux-flow 2.8s linear infinite}
.lux-v8{background:linear-gradient(135deg,#546E7A,#CFD8DC,#FFFFFF,#ECEFF1,#FFFFFF,#90A4AE,#CFD8DC,#FFFFFF);box-shadow:0 0 12px rgba(207,216,220,.6),0 0 28px rgba(255,255,255,.38),0 0 52px rgba(176,190,197,.2),0 0 80px rgba(236,239,241,.08);animation:lux-flow 5.5s ease-in-out infinite}
.lux-v9{background:linear-gradient(135deg,#00E5FF,#00FFAA,#FF00FF,#00E5FF,#7C4DFF,#00FF88,#FF00FF,#00E5FF);box-shadow:0 0 18px rgba(0,229,255,.78),0 0 40px rgba(255,0,255,.52),0 0 70px rgba(0,255,136,.3),0 0 100px rgba(0,229,255,.12);animation:lux-flow 2s linear infinite}
@keyframes corner-spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
@keyframes corner-spin-rev { 0%{transform:rotate(0deg)} 100%{transform:rotate(-360deg)} }
@keyframes tamat-shimmer { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
@keyframes tamat-seal-glow { 0%,100%{filter:drop-shadow(0 0 4px rgba(255,215,0,0.7))} 50%{filter:drop-shadow(0 0 9px rgba(255,215,0,0.95))} }
@keyframes neweps-pulse { 0%,100%{box-shadow:0 0 6px rgba(124,58,237,.55),0 0 14px rgba(139,92,246,.35)} 50%{box-shadow:0 0 12px rgba(167,139,250,.85),0 0 26px rgba(139,92,246,.55)} }
@keyframes neweps-live-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.7)} }
@keyframes newrilis-shimmer { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
@keyframes newrilis-flare { 0%,100%{box-shadow:0 0 7px rgba(255,107,0,.6),0 0 16px rgba(255,61,0,.4)} 50%{box-shadow:0 0 13px rgba(255,159,0,.9),0 0 28px rgba(255,61,0,.6)} }
@keyframes countdown-glow { 0%,100%{box-shadow:0 0 6px rgba(96,165,250,.25),inset 0 0 0 1px rgba(96,165,250,.3)} 50%{box-shadow:0 0 12px rgba(96,165,250,.45),inset 0 0 0 1px rgba(96,165,250,.5)} }
@keyframes countdown-blink { 0%,49%{opacity:1} 50%,100%{opacity:.25} }
@keyframes season-glow {
  0%,100% { box-shadow: 0 0 6px rgba(96,165,250,.25), inset 0 0 0 1px rgba(96,165,250,.3); }
  50%      { box-shadow: 0 0 16px rgba(96,165,250,.5), inset 0 0 0 1px rgba(96,165,250,.55); }
}
@keyframes season-pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
@keyframes shimmer-gold { 0%{background-position: 0% 50%} 100%{background-position: 200% 50%} }
`;let N=!1;function H(){if(N||typeof document>"u")return;N=!0;const a=document.createElement("style");a.textContent=_,document.head.appendChild(a)}function C(a){const r=String(a);let t=5381;for(let n=0;n<r.length;n++)t=(t<<5)+t^r.charCodeAt(n);return Math.abs(t)%10}function B({color:a,variant:r}){const t=r%2===0?"corner-spin":"corner-spin-rev",n=(3+r%5*.8).toFixed(1)+"s",s=4+r%3,o={position:"absolute",width:s,height:s,borderRadius:"50%",background:a,boxShadow:`0 0 6px ${a}, 0 0 12px ${a}`,pointerEvents:"none",zIndex:5};return r%3!==0?null:e.jsxs(e.Fragment,{children:[e.jsx("span",{style:{...o,top:-s/2,left:-s/2,animation:`${t} ${n} linear infinite`}}),e.jsx("span",{style:{...o,bottom:-s/2,right:-s/2,animation:`${t} ${n} linear infinite reverse`}})]})}const f={WINTER:{emoji:"❄️",label:"Winter",jpeg:"Januari – Maret",accent:"#7DD3FC"},SPRING:{emoji:"🌸",label:"Spring",jpeg:"April – Juni",accent:"#F472B6"},SUMMER:{emoji:"☀️",label:"Summer",jpeg:"Juli – September",accent:"#FBBF24"},FALL:{emoji:"🍂",label:"Fall",jpeg:"Oktober – Desember",accent:"#FB923C"}},D={WINTER:"rgba(125,211,252,0.35)",SPRING:"rgba(244,114,182,0.35)",SUMMER:"rgba(251,191,36,0.35)",FALL:"rgba(251,146,60,0.35)"};function $(a=1e3){const[,r]=u.useState(0);u.useEffect(()=>{const t=setInterval(()=>r(n=>n+1),a);return()=>clearInterval(t)},[a])}function T(){return{onMouseMove:a=>{const r=a.currentTarget,t=r.getBoundingClientRect(),n=(a.clientX-t.left)/t.width-.5,s=(a.clientY-t.top)/t.height-.5;r.style.transform=`perspective(600px) rotateX(${(-s*14).toFixed(1)}deg) rotateY(${(n*14).toFixed(1)}deg) scale(1.04)`},onMouseLeave:a=>{a.currentTarget.style.transform="perspective(600px) rotateX(0deg) rotateY(0deg) scale(1)"},onTouchMove:a=>{const r=a.currentTarget,t=r.getBoundingClientRect(),n=a.touches[0],s=(n.clientX-t.left)/t.width-.5,o=(n.clientY-t.top)/t.height-.5;r.style.transform=`perspective(600px) rotateX(${(-o*10).toFixed(1)}deg) rotateY(${(s*10).toFixed(1)}deg) scale(1.03)`},onTouchEnd:a=>{a.currentTarget.style.transform="perspective(600px) rotateX(0deg) rotateY(0deg) scale(1)"}}}function U({anime:a}){const[r,t]=u.useState(!1),[n,s]=u.useState(!1),o=a.title?.romaji||a.title?.english||"??",[l,i]=I(o),d=a.coverImage?.extraLarge||a.coverImage?.large||"";return e.jsxs("div",{className:"relative overflow-hidden rounded-xl",style:{aspectRatio:"2/3",minHeight:120,background:l},children:[!n&&d?e.jsx("img",{src:L(d),alt:o,loading:"lazy",onLoad:()=>t(!0),onError:()=>s(!0),className:"absolute inset-0 w-full h-full object-cover",style:{opacity:r?1:0,transition:"opacity 0.4s ease"}}):e.jsx("div",{className:"absolute inset-0 flex items-center justify-center",children:e.jsx("span",{style:{fontSize:"clamp(14px,3vw,24px)",fontWeight:900,color:"rgba(255,255,255,0.3)",letterSpacing:"0.05em"},children:i})}),e.jsx("div",{className:"absolute inset-0 pointer-events-none",style:{background:"linear-gradient(to top, rgba(7,7,14,0.95) 0%, transparent 50%)"}}),e.jsx("div",{className:"absolute inset-0 pointer-events-none",style:{background:"linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 45%)"}})]})}function G(){return u.useEffect(()=>{const a=["#7DD3FC","#F472B6","#FBBF24","#A78BFA","#34D399","#FF8C42"];let r=0,t=0;const n=s=>{const o=performance.now();o-r<16||(r=o,t=requestAnimationFrame(()=>{const l=a[Math.floor(Math.random()*a.length)],i=document.createElement("span");i.className="mouse-sparkle-life";const d=6+Math.random()*5;i.style.cssText=`position:fixed;left:${s.clientX}px;top:${s.clientY}px;width:${d}px;height:${d}px;border-radius:50%;background:radial-gradient(circle,#fff 0%,${l} 50%,transparent 100%);pointer-events:none;z-index:99999;box-shadow:0 0 10px ${l};`,document.body.appendChild(i),setTimeout(()=>i.remove(),950)}))};return window.addEventListener("mousemove",n,{passive:!0}),()=>{window.removeEventListener("mousemove",n),cancelAnimationFrame(t)}},[]),null}function P(a,r,t){const n=["#7DD3FC","#F472B6","#FBBF24","#A78BFA","#34D399",t],s=14;for(let o=0;o<s;o++){const l=o/s*Math.PI*2+(Math.random()-.5)*.4,i=70+Math.random()*55,d=Math.cos(l)*i,p=Math.sin(l)*i-25,c=document.createElement("span");c.className="tab-confetti-life";const g=n[o%n.length],b=5+Math.random()*4;c.style.cssText=`position:fixed;left:${a}px;top:${r}px;width:${b}px;height:${b}px;border-radius:50%;background:${g};pointer-events:none;z-index:99998;box-shadow:0 0 9px ${g};--dx:${d}px;--dy:${p}px;`,document.body.appendChild(c),setTimeout(()=>c.remove(),1e3)}}function O(){const a=["🌸","✨","🍂","❄️","🌿","💫","🌺"];return e.jsxs("div",{className:"fixed inset-0 pointer-events-none overflow-hidden","aria-hidden":"true",style:{zIndex:0},children:[e.jsx("div",{className:"absolute inset-0",style:{background:`
          radial-gradient(ellipse 700px 500px at 18% 28%, rgba(125,211,252,0.20), transparent 60%),
          radial-gradient(ellipse 600px 400px at 78% 18%, rgba(244,114,182,0.14), transparent 60%),
          radial-gradient(ellipse 800px 500px at 50% 88%, rgba(251,191,36,0.16), transparent 60%),
          radial-gradient(ellipse 500px 350px at 8% 78%, rgba(167,139,250,0.12), transparent 60%),
          radial-gradient(ellipse 400px 300px at 90% 65%, rgba(52,211,153,0.10), transparent 60%)
        `,backgroundSize:"180% 180%",filter:"blur(28px)",animation:"cosmic-aurora 24s ease-in-out infinite alternate"}}),Array.from({length:24}).map((r,t)=>{const n=a[t%a.length],s=t*7.3%100,o=11+t%4*2.5,l=t%7*1.1,i=12+t%3*5;return e.jsx("span",{"aria-hidden":!0,className:"absolute",style:{left:`${s}%`,bottom:-40,fontSize:i,opacity:0,animation:`petal-float-up ${o}s linear ${l}s infinite`,filter:`drop-shadow(0 0 8px rgba(255,255,255,0.4)) hue-rotate(${t*30}deg)`},children:n},t)})]})}function q(){const a=u.useRef(null),[r,t]=u.useState(!1);return u.useEffect(()=>{const n=a.current;if(!n)return;const s=new IntersectionObserver(([o])=>{o.isIntersecting&&(t(!0),s.disconnect())},{threshold:.15,rootMargin:"0px 0px -40px 0px"});return s.observe(n),()=>s.disconnect()},[]),{ref:a,visible:r}}const W={UPCOMING:{label:"COMING",icon:"⏳",from:"#1E3A8A",mid:"#60A5FA",to:"#7DD3FC",text:"#fff",glow:"rgba(96,165,250,0.5)",border:"rgba(125,211,252,0.4)"},SEDANG_TAYANG:{label:"ON AIR",icon:"🔴",from:"#065F46",mid:"#10B981",to:"#34D399",text:"#fff",glow:"rgba(52,211,153,0.55)",border:"rgba(52,211,153,0.4)"},SUDAH_RILIS:{label:"SUDAH RILIS",icon:"✅",from:"#92400E",mid:"#F59E0B",to:"#FBBF24",text:"#fff",glow:"rgba(251,191,36,0.55)",border:"rgba(251,191,36,0.4)"},SUDAH_TAMAT:{label:"TAMAT",icon:"🏁",from:"#581C87",mid:"#8B5CF6",to:"#A78BFA",text:"#fff",glow:"rgba(167,139,250,0.5)",border:"rgba(167,139,250,0.4)"},TBA:{label:"SEGERA",icon:"📅",from:"#1F2937",mid:"#475569",to:"#64748B",text:"#D1D5DB",glow:"rgba(148,163,184,0.25)",border:"rgba(148,163,184,0.3)"}};function J({status:a}){const r=W[a];return e.jsx("div",{className:"absolute top-2 right-2 z-10",style:{animation:"tamat-seal-glow 2.4s ease-in-out infinite"},children:e.jsxs("div",{className:"flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-l-full",style:{background:`linear-gradient(135deg, ${r.from} 0%, ${r.mid} 30%, ${r.to} 50%, ${r.from} 70%, ${r.from})`,backgroundSize:"200% 200%",animation:"shimmer-gold 2.8s linear infinite",color:r.text,boxShadow:`0 2px 10px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.4), 0 0 8px ${r.glow}`,border:`1px solid ${r.border}`},children:[e.jsx("span",{style:{fontSize:11},children:r.icon}),e.jsx("span",{style:{fontSize:9,fontWeight:900,letterSpacing:"0.04em",textShadow:"0 0 4px rgba(0,0,0,0.5)"},children:r.label})]})})}function K({airingAt:a}){if($(1e3),!a)return null;const r=Math.max(0,a-Math.floor(Date.now()/1e3)),t=X(r);return e.jsxs("div",{className:"inline-flex items-center gap-1.5",style:{padding:"4px 8px",borderRadius:9999,background:"linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,58,95,0.7))",border:"1px solid rgba(96,165,250,0.45)",backdropFilter:"blur(8px)",animation:"countdown-glow 2.4s ease-in-out infinite",maxWidth:"100%"},children:[e.jsx("span",{style:{animation:"countdown-blink 1.6s steps(1) infinite",fontSize:11},children:"⏳"}),e.jsx("span",{className:"text-[10px] font-black tabular-nums truncate",style:{color:"#7DD3FC",letterSpacing:"0.02em"},children:t})]})}function Q({anime:a,accent:r}){const[,t]=R(),n=C(a.id),s=T(),o=a.airingAt??null,l=o!==null?1:null,i=a.title.english||a.title.romaji,d=o?Y({unix:o}):null,p=(a.genres??[]).slice(0,2),c=F(o,a.status),{ref:g,visible:b}=q();return e.jsx("div",{ref:g,className:`relative reveal-on-scroll ${b?"is-visible":""}`,style:{perspective:600,willChange:"transform, opacity"},children:e.jsxs("div",{className:"lux-shine flex-shrink-0 cursor-pointer","data-testid":`season-card-${a.id}`,style:{transition:"transform 0.15s ease",willChange:"transform"},...s,onClick:()=>t(`/upcoming/${a.id}`),children:[e.jsxs("div",{className:`lux-wrap lux-v${n}`,style:{position:"relative"},children:[e.jsx(B,{color:E[n].glow,variant:n}),e.jsxs("div",{className:"relative overflow-hidden rounded-xl",style:{boxShadow:"0 4px 20px rgba(0,0,0,0.6)",background:"#050510"},children:[e.jsx(U,{anime:a}),e.jsxs("div",{className:"absolute bottom-2 left-2 flex flex-col gap-[3px] z-10",children:[l!=null&&e.jsxs("span",{className:"text-[10px] font-bold px-1.5 py-[2px] rounded-full w-fit",style:{background:"rgba(255,107,0,0.85)",backdropFilter:"blur(8px)",color:"#fff",boxShadow:"0 0 8px rgba(255,107,0,0.4)"},children:["EP ",l]}),(a.seasonYear!=null||a.averageScore!=null)&&e.jsxs("span",{className:"text-[9px] font-medium px-1.5 py-[2px] rounded-full w-fit whitespace-nowrap",style:{background:"rgba(0,0,0,0.60)",backdropFilter:"blur(4px)",color:"rgba(255,255,255,0.88)",lineHeight:1.2},children:[a.averageScore!=null&&`🌟${(a.averageScore/10).toFixed(1)}`,a.averageScore!=null&&a.seasonYear!=null&&" · ",a.seasonYear!=null&&`🗓 ${a.seasonYear}`]})]}),e.jsx(J,{status:c})]})]}),e.jsx("p",{className:"mt-1.5 text-xs font-semibold text-white line-clamp-2 leading-tight px-0.5",children:i}),p.length>0&&e.jsx("div",{className:"mt-1 flex flex-wrap gap-1 px-0.5",children:p.map(m=>e.jsx("span",{className:"text-[9px] font-semibold px-1.5 py-[2px] rounded-full",style:{background:`${r}1a`,color:r,border:`1px solid ${r}33`,boxShadow:`0 0 6px ${r}22`},children:m},m))}),e.jsxs("div",{className:"mt-1.5 flex flex-col gap-0.5 px-0.5",children:[c==="UPCOMING"&&o&&e.jsxs(e.Fragment,{children:[e.jsx(K,{airingAt:o}),d&&e.jsxs("span",{className:"text-[9px] font-medium truncate",style:{color:"rgba(255,255,255,0.55)"},children:["📅 ",d]})]}),c==="SEDANG_TAYANG"&&e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"text-[10px] font-black px-2 py-1 rounded-full w-fit",style:{background:"rgba(52,211,153,0.18)",color:"#34D399",border:"1px solid rgba(52,211,153,0.35)"},children:"🟢 ON AIR — episode pertama tayang"}),d&&e.jsxs("span",{className:"text-[9px] font-medium truncate",style:{color:"rgba(255,255,255,0.55)"},children:["📅 sejak ",d]})]}),c==="SUDAH_RILIS"&&d&&e.jsxs("span",{className:"text-[10px] font-black px-2 py-1 rounded-full w-fit",style:{background:"rgba(251,191,36,0.18)",color:"#FBBF24",border:"1px solid rgba(251,191,36,0.35)"},children:["📅 Tayang ",d]}),c==="SUDAH_TAMAT"&&e.jsx("span",{className:"text-[10px] font-black px-2 py-1 rounded-full w-fit",style:{background:"rgba(167,139,250,0.18)",color:"#A78BFA",border:"1px solid rgba(167,139,250,0.35)"},children:"🏁 Sudah tamat"}),c==="TBA"&&e.jsx("span",{className:"text-[10px] font-black px-2 py-1 rounded-full w-fit",style:{background:"rgba(148,163,184,0.16)",color:"#94A3B8",border:"1px solid rgba(148,163,184,0.35)"},children:"📅 Tanggal rilis belum diumumkan"})]})]})})}function V({sk:a,accent:r,count:t,isFirst:n,source:s}){const o=f[a.season],l=s&&s!=="MAL"&&s!=="none",i=s==="AniSubCache"?"via AniSub Cache":"via AniList";return e.jsxs("div",{className:"flex items-center gap-3 mb-3 sticky z-20 py-3 px-4 -mx-4 mt-1",style:{top:n?0:56,background:"linear-gradient(to bottom, rgba(5,5,16,0.96), rgba(5,5,16,0.85))",backdropFilter:"blur(20px)",borderBottom:`1px solid ${r}22`},children:[e.jsx("div",{className:"text-2xl",style:{filter:`drop-shadow(0 0 8px ${r}aa)`},children:o.emoji}),e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsxs("h2",{className:"holo-title text-lg font-black truncate",style:{letterSpacing:"-0.01em"},children:[o.label," ",a.year]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs("p",{className:"text-[10px] font-semibold uppercase tracking-wider",style:{color:r},children:[o.jpeg," • ",t," judul lineup"]}),l&&e.jsx("span",{className:"text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider",title:"MAL/JIKAN sedang tidak tersedia — lineup dari AniList sebagai backup",style:{background:"rgba(251,191,36,0.15)",color:"rgba(251,191,36,0.9)",border:"1px solid rgba(251,191,36,0.35)",letterSpacing:"0.06em"},children:i})]})]}),e.jsx("span",{className:"text-[10px] font-black px-2.5 py-1 rounded-full flex-shrink-0",style:{background:`linear-gradient(135deg, ${r}33, ${r}1a)`,backgroundSize:"200% 200%",animation:"shimmer-gold 3s linear infinite",color:r,border:`1px solid ${r}55`,boxShadow:`0 0 14px ${D[a.season]}`},children:a.year})]})}function Z({sk:a,accent:r,isFirst:t,searchFilter:n}){const{data:s,isLoading:o,isFetching:l,refetch:i}=w({queryKey:["season-lineup",a.season,a.year],queryFn:()=>y(a),staleTime:36e5,retry:3,retryDelay:p=>Math.min(1e3*(p+1),4e3)}),d=u.useMemo(()=>{if(!s)return[];const p=new Set,c=s.data.filter(x=>!x.id||p.has(x.id)?!1:(p.add(x.id),!0)),g=Date.now(),b=n.trim().toLowerCase();return(b?c.filter(x=>(x.title?.english||x.title?.romaji||"").toLowerCase().includes(b)):c).sort((x,h)=>{const v=S[F(x.airingAt,x.status,g)],k=S[F(h.airingAt,h.status,g)];if(v!==k)return v-k;const j=x.airingAt??Number.MAX_SAFE_INTEGER,A=h.airingAt??Number.MAX_SAFE_INTEGER;return j!==A?j-A:(h.popularity??0)-(x.popularity??0)})},[s,n]);return e.jsxs("section",{className:"mb-8","data-testid":`season-section-${a.season}-${a.year}`,children:[e.jsx(V,{sk:a,accent:r,count:d.length,isFirst:t,source:s?.source}),o&&e.jsx("div",{className:"grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 px-1",children:Array.from({length:8}).map((p,c)=>e.jsx("div",{className:"lux-wrap",style:{animation:"pulse 1.5s ease-in-out infinite",opacity:.5},children:e.jsx("div",{className:"rounded-xl",style:{aspectRatio:"2/3",background:"linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",minHeight:160}})},c))}),!o&&d.length===0&&(s?.error?e.jsxs("div",{className:"text-center py-6 space-y-3",children:[e.jsxs("p",{className:"text-xs",style:{color:"rgba(251,191,36,0.85)"},children:["Lineup MAL sedang dimuat ulang untuk ",f[a.season].label," ",a.year,"."]}),e.jsx("button",{type:"button",onClick:()=>i(),disabled:l,className:"px-4 py-2 rounded-full text-xs font-black",style:{color:r,border:`1px solid ${r}88`,background:`${r}18`},children:l?"Mencoba lagi…":"Coba lagi"})]}):e.jsxs("div",{className:"text-center py-6 space-y-1",children:[e.jsxs("p",{className:"text-xs",style:{color:"rgba(255,255,255,0.55)"},children:["Sepertinya semua lineup ",f[a.season].label," ",a.year," sudah mulai tayang."]}),e.jsxs("p",{className:"text-[10px]",style:{color:"rgba(255,255,255,0.4)"},children:["Lihat tab ",e.jsx("span",{style:{color:"rgba(125,211,252,0.85)"},children:"Jadwal"})," untuk episode terbaru 📺"]})]})),d.length>0&&e.jsx("div",{className:"grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 px-1",children:d.map(p=>e.jsx(Q,{anime:p,accent:r},p.id))})]})}function ee({query:a,onChange:r}){return e.jsx("div",{className:"mb-3 px-1",children:e.jsxs("div",{className:"relative flex items-center","data-testid":"season-search-wrap",children:[e.jsx("span",{className:"absolute left-3 top-1/2 -translate-y-1/2 text-base pointer-events-none select-none",style:{filter:"drop-shadow(0 0 7px rgba(125,211,252,0.55))"},children:"🔍"}),e.jsx("input",{type:"text",value:a,onChange:t=>r(t.target.value),placeholder:"Cari anime di musim ini…","data-testid":"season-search-input",className:"w-full pl-9 pr-9 py-2.5 rounded-xl text-[13px] font-semibold outline-none",style:{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.10)",color:"#F8FAFC",letterSpacing:"0.005em",transition:"all 0.18s ease"},onFocus:t=>{t.currentTarget.style.background="rgba(255,255,255,0.10)",t.currentTarget.style.borderColor="rgba(125,211,252,0.55)",t.currentTarget.style.boxShadow="0 0 14px rgba(125,211,252,0.18)"},onBlur:t=>{t.currentTarget.style.background="rgba(255,255,255,0.06)",t.currentTarget.style.borderColor="rgba(255,255,255,0.10)",t.currentTarget.style.boxShadow="none"}}),a&&e.jsx("button",{type:"button",onClick:()=>r(""),"aria-label":"Clear search","data-testid":"season-search-clear",className:"absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full font-bold",style:{background:"rgba(255,255,255,0.10)",color:"#F8FAFC",lineHeight:1,border:"1px solid rgba(255,255,255,0.18)",transition:"all 0.15s ease"},onMouseEnter:t=>{t.currentTarget.style.background="rgba(244,114,182,0.30)"},onMouseLeave:t=>{t.currentTarget.style.background="rgba(255,255,255,0.10)"},children:"×"})]})})}function ae({activeIdx:a,onChange:r,seasons:t}){return e.jsx("div",{className:"flex gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1.5 -mx-1 px-1",children:t.map((n,s)=>{const o=f[n.season],l=o.accent,i=a===s,{data:d}=w({queryKey:["season-lineup",n.season,n.year],queryFn:()=>y(n),staleTime:60*6e4}),p=(d?.data??[]).length;return e.jsxs("button",{onClick:c=>{r(s);const g=c.currentTarget.getBoundingClientRect();P(g.left+g.width/2,g.top+g.height/2,i?"#7DD3FC":"#F472B6")},className:`season-tab-pill flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full card-press ${i?"is-active":""}`,"data-testid":`season-tab-${n.season}-${n.year}`,style:{background:i?`linear-gradient(135deg, ${l}33, ${l}1a)`:"rgba(255,255,255,0.04)",color:i?"#F8FAFC":"#94A3B8",border:i?`1px solid ${l}55`:"1px solid rgba(255,255,255,0.07)",transition:"all 0.18s ease",boxShadow:i?`0 0 14px ${D[n.season]}`:"none",fontWeight:800,fontSize:11,letterSpacing:"0.01em"},children:[e.jsxs("span",{style:{filter:i?`drop-shadow(0 0 6px ${l}77)`:"none",whiteSpace:"nowrap"},children:[o.emoji," ",o.label," ",n.year]}),e.jsx("span",{className:"inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[9px] font-black tabular-nums",style:{background:i?`${l}22`:"rgba(255,255,255,0.06)",color:i?l:"#64748B",minWidth:18,border:i?`1px solid ${l}33`:"none"},children:p})]},`${n.season}-${n.year}`)})})}function ce(){u.useEffect(()=>{H()},[]),$(6e4);const a=M(),r=u.useMemo(()=>z(),[]),[t,n]=u.useState(()=>new Date),[s,o]=u.useState(0),[l,i]=u.useState(""),d=r[s],p=f[d.season].accent;return u.useEffect(()=>{r.forEach(c=>{a.prefetchQuery({queryKey:["season-lineup",c.season,c.year],queryFn:()=>y(c),staleTime:60*6e4})})},[a,r]),e.jsxs("div",{className:"min-h-screen pb-28 px-3 pt-4 relative",style:{background:"#05050f"},children:[e.jsx("style",{children:`
        @keyframes cosmic-aurora {
          0%   { background-position: 0% 0%, 100% 0%, 50% 100%, 0% 100%, 80% 80%; transform: scale(1) rotate(0deg); }
          50%  { background-position: 60% 50%, 30% 60%, 70% 30%, 30% 40%, 20% 30%; transform: scale(1.08) rotate(2deg); }
          100% { background-position: 100% 100%, 0% 100%, 100% 0%, 80% 0%, 0% 0%; transform: scale(1) rotate(-2deg); }
        }
        @keyframes petal-float-up {
          0%   { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0; }
          3%   { opacity: 0.65; }
          50%  { transform: translate3d(70px, -50vh, 0) rotate(170deg); }
          98%  { opacity: 0.4; }
          100% { transform: translate3d(-30px, -110vh, 0) rotate(360deg); opacity: 0; }
        }
        @keyframes reveal-up {
          0%   { opacity: 0; transform: translateY(28px) scale(0.96); filter: blur(4px); }
          100% { opacity: 1; transform: translateY(0)     scale(1);    filter: blur(0); }
        }
        .reveal-on-scroll { opacity: 0; transform: translateY(28px) scale(0.96); filter: blur(4px); }
        .reveal-on-scroll.is-visible {
          animation: reveal-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        /* Shine-sweep — overlay gradient diagonal yang sweep saat hover */
        .lux-shine { position: relative; overflow: hidden; }
        .lux-shine::before {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%);
          background-size: 250% 250%;
          opacity: 0;
          transition: opacity 0.35s ease;
          border-radius: inherit;
          z-index: 5;
          mix-blend-mode: screen;
        }
        .lux-shine:hover::before {
          opacity: 1;
          animation: shine-sweep 1.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes shine-sweep {
          0%   { background-position: 250% 0; }
          100% { background-position: -150% 0; }
        }
        /* Mouse-trail sparkle lifecycle */
        @keyframes sparkle-life {
          0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
          20%  { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(0.15); opacity: 0; }
        }
        .mouse-sparkle-life {
          animation: sparkle-life 0.9s ease-out forwards;
          transform: translate(-50%, -50%);
        }
        /* Tab-confetti fly-out */
        @keyframes tab-confetti-fly {
          0%   { transform: translate(-50%, -50%) scale(1);                                              opacity: 1; }
          60%  { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.8);         opacity: 0.7; }
          100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.2);         opacity: 0; }
        }
        .tab-confetti-life {
          animation: tab-confetti-fly 0.95s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transform: translate(-50%, -50%);
        }
        /* Holo-rainbow title — gradient horizontal yang loop, anime aesthetic */
        @keyframes holo-shift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 150% 50%; }
          100% { background-position: 200% 50%; }
        }
        .holo-title {
          background: linear-gradient(110deg, #7DD3FC 0%, #F472B6 25%, #FBBF24 50%, #A78BFA 75%, #7DD3FC 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          -webkit-text-fill-color: transparent;
          animation: holo-shift 4.5s linear infinite;
          filter: drop-shadow(0 0 14px rgba(244,114,182,0.35));
          display: inline-block;
        }
        .season-tab-pill::after {
          content: ""; position: absolute; left: 16%; right: 16%; bottom: -3px;
          height: 3px; border-radius: 999px; background: currentColor;
          opacity: 0; transform: scaleX(0.4);
          transition: opacity 0.3s ease, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 0 12px currentColor;
        }
        .season-tab-pill.is-active::after {
          opacity: 1; transform: scaleX(1);
          animation: tab-underline-pulse 1.8s ease-in-out infinite;
        }
        @keyframes tab-underline-pulse {
          0%, 100% { transform: scaleX(1);    opacity: 0.85; }
          50%      { transform: scaleX(1.18); opacity: 1;    }
        }
        /* ── Per-season animated hero motif (snow / sakura / sun / leafs) ── */
        @keyframes season-snow-fall {
          0%   { transform: translateY(-3vh) translateX(0)       rotate(0deg);   opacity: 0;   }
          10%  { opacity: 0.95; }
          90%  { opacity: 0.7; }
          100% { transform: translateY(112vh) translateX(46px)  rotate(360deg); opacity: 0;   }
        }
        .season-particle-snow {
          animation-name: season-snow-fall;
          animation-iteration-count: infinite;
          animation-timing-function: linear;
          color: rgba(255,255,255,0.95);
          text-shadow: 0 0 6px rgba(186,230,253,0.85);
        }

        @keyframes season-sakura-sway {
          0%   { transform: translateY(-3vh) translateX(0)       rotate(0deg);   opacity: 0; }
          20%  { opacity: 1; }
          50%  { transform: translateY(50vh) translateX(22px)    rotate(180deg); opacity: 1; }
          80%  { transform: translateY(82vh) translateX(-14px)   rotate(260deg); opacity: 0.85; }
          100% { transform: translateY(112vh) translateX(8px)    rotate(360deg); opacity: 0; }
        }
        .season-particle-sakura {
          animation-name: season-sakura-sway;
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
          color: #FBCFE8;
          filter: drop-shadow(0 0 4px #F472B6);
        }

        @keyframes season-sun-pulse {
          0%, 100% { transform: scale(0.55); opacity: 0.35; }
          50%      { transform: scale(1.4);  opacity: 1;    }
        }
        .season-particle-sun {
          animation-name: season-sun-pulse;
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
          color: #FCD34D;
          text-shadow: 0 0 12px #F59E0B, 0 0 24px #FBBF24;
        }

        @keyframes season-leaf-twirl {
          0%   { transform: translateY(-3vh) translateX(0)        rotate(0deg);   opacity: 0;   }
          12%  { opacity: 0.95; }
          50%  { transform: translateY(50vh) translateX(-32px)    rotate(180deg); opacity: 0.9; }
          85%  { opacity: 0.7; }
          100% { transform: translateY(112vh) translateX(20px)   rotate(360deg); opacity: 0;   }
        }
        .season-particle-leafs {
          animation-name: season-leaf-twirl;
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
          color: #FED7AA;
          text-shadow: 0 0 4px rgba(220,90,30,0.55);
        }
      `}),e.jsx(O,{}),e.jsx(G,{}),e.jsxs("div",{className:"relative z-10",children:[e.jsxs("header",{className:"mb-4 px-1",children:[e.jsxs("div",{className:"flex items-end justify-between mb-1",children:[e.jsx("h1",{className:"text-2xl font-black text-white tracking-tight",style:{textShadow:"0 0 14px rgba(125,211,252,0.5)"},children:"🗓 Musim"}),e.jsx("span",{className:"text-[10px] font-semibold uppercase tracking-wider",style:{color:"rgba(255,255,255,0.5)"},children:t.toLocaleDateString("id-ID",{weekday:"short",day:"numeric",month:"short",year:"numeric"})})]}),e.jsx("p",{className:"text-xs",style:{color:"rgba(255,255,255,0.6)"},children:"4 musim ke depan • lineup + hitung mundur akurat ke detik. Update tiap jam."})]}),e.jsx(se,{activeSk:d,isFirst:s===0}),e.jsx(ee,{query:l,onChange:i}),e.jsx(ae,{activeIdx:s,onChange:o,seasons:r}),e.jsx(Z,{sk:d,accent:p,isFirst:!0,searchFilter:l})]})]})}const te={WINTER:"radial-gradient(ellipse at 30% 18%, #38BDF8 0%, #1E40AF 30%, #0F172A 70%, #020617 100%)",SPRING:"radial-gradient(ellipse at 50% 22%, #F472B6 0%, #BE185D 30%, #831843 70%, #1E1B4B 100%)",SUMMER:"radial-gradient(ellipse at 60% 18%, #FEF08A 0%, #FBBF24 22%, #F59E0B 50%, #B45309 80%, #7C2D12 100%)",FALL:"radial-gradient(ellipse at 70% 20%, #FB923C 0%, #EA580C 28%, #9A3412 65%, #450A0A 100%)"},re={WINTER:{kind:"snow",count:30},SPRING:{kind:"sakura",count:22},SUMMER:{kind:"sun",count:14},FALL:{kind:"leafs",count:24}};async function ne(){try{const a="/Jumalia-Makruf/anime/".replace(/\/$/,"")??"",r=await fetch(`${a}/api/banners`,{signal:AbortSignal.timeout(8e3)});return r.ok?await r.json():{}}catch{return{}}}function se({activeSk:a,isFirst:r}){const t=a;f[t.season].accent;const s=C(`hero-${t.season}-${t.year}`),o=T(),[l,i]=u.useState(!1),[d,p]=u.useState(null),c=u.useRef(null);u.useEffect(()=>{i(!1),p(null),c.current&&c.current.load()},[t.season]),u.useEffect(()=>{ne().then(m=>{const x=t.season.toLowerCase();m[x]&&p(m[x])})},[t.season]);const{data:g}=w({queryKey:["season-lineup",t.season,t.year],queryFn:()=>y(t),staleTime:60*6e4});g?.data?.length,re[t.season];const b=d;return e.jsx("div",{className:"mb-5 cursor-pointer relative",style:{transition:"transform 0.15s ease",willChange:"transform"},...o,children:e.jsxs("div",{className:`lux-wrap lux-v${s}`,children:[e.jsx(B,{color:E[s].glow,variant:s}),e.jsx("div",{className:"rounded-2xl relative overflow-hidden",style:{background:te[t.season],minHeight:168,backdropFilter:"blur(20px)"},children:!l&&b&&e.jsx("video",{ref:c,autoPlay:!0,muted:!0,loop:!0,playsInline:!0,onError:()=>i(!0),onCanPlay:()=>{c.current?.play().catch(()=>{})},onLoadedData:()=>{c.current?.play().catch(()=>{})},className:"absolute inset-0 w-full h-full pointer-events-none",style:{objectFit:"cover",opacity:1,zIndex:0},children:e.jsx("source",{src:b,type:"video/mp4"})},t.season)})]})})}export{ce as default};
