import{r as u,e as D,j as e,u as M,t as I,p as R}from"./index-Dy2rfYbN.js";import{u as F}from"./useQuery-DWFwwJtB.js";import{g as L,f as h,S as A,c as v,a as z,b as Y}from"./malSeason-DREEhUz8.js";import{i as X,h as E,C as $,V as B}from"./cardBorders-aucb20FM.js";const f={WINTER:{emoji:"❄️",label:"Winter",jpeg:"Januari – Maret",accent:"#7DD3FC"},SPRING:{emoji:"🌸",label:"Spring",jpeg:"April – Juni",accent:"#F472B6"},SUMMER:{emoji:"☀️",label:"Summer",jpeg:"Juli – September",accent:"#FBBF24"},FALL:{emoji:"🍂",label:"Fall",jpeg:"Oktober – Desember",accent:"#FB923C"}},j={WINTER:"rgba(125,211,252,0.35)",SPRING:"rgba(244,114,182,0.35)",SUMMER:"rgba(251,191,36,0.35)",FALL:"rgba(251,146,60,0.35)"};function C(t=1e3){const[,r]=u.useState(0);u.useEffect(()=>{const a=setInterval(()=>r(s=>s+1),t);return()=>clearInterval(a)},[t])}function T(){return{onMouseMove:t=>{const r=t.currentTarget,a=r.getBoundingClientRect(),s=(t.clientX-a.left)/a.width-.5,n=(t.clientY-a.top)/a.height-.5;r.style.transform=`perspective(600px) rotateX(${(-n*14).toFixed(1)}deg) rotateY(${(s*14).toFixed(1)}deg) scale(1.04)`},onMouseLeave:t=>{t.currentTarget.style.transform="perspective(600px) rotateX(0deg) rotateY(0deg) scale(1)"},onTouchMove:t=>{const r=t.currentTarget,a=r.getBoundingClientRect(),s=t.touches[0],n=(s.clientX-a.left)/a.width-.5,o=(s.clientY-a.top)/a.height-.5;r.style.transform=`perspective(600px) rotateX(${(-o*10).toFixed(1)}deg) rotateY(${(n*10).toFixed(1)}deg) scale(1.03)`},onTouchEnd:t=>{t.currentTarget.style.transform="perspective(600px) rotateX(0deg) rotateY(0deg) scale(1)"}}}function _({anime:t}){const[r,a]=u.useState(!1),[s,n]=u.useState(!1),o=t.title?.romaji||t.title?.english||"??",[i,l]=I(o),c=t.coverImage?.extraLarge||t.coverImage?.large||"";return e.jsxs("div",{className:"relative overflow-hidden rounded-xl",style:{aspectRatio:"2/3",minHeight:120,background:i},children:[!s&&c?e.jsx("img",{src:R(c),alt:o,loading:"lazy",onLoad:()=>a(!0),onError:()=>n(!0),className:"absolute inset-0 w-full h-full object-cover",style:{opacity:r?1:0,transition:"opacity 0.4s ease"}}):e.jsx("div",{className:"absolute inset-0 flex items-center justify-center",children:e.jsx("span",{style:{fontSize:"clamp(14px,3vw,24px)",fontWeight:900,color:"rgba(255,255,255,0.3)",letterSpacing:"0.05em"},children:l})}),e.jsx("div",{className:"absolute inset-0 pointer-events-none",style:{background:"linear-gradient(to top, rgba(7,7,14,0.95) 0%, transparent 50%)"}}),e.jsx("div",{className:"absolute inset-0 pointer-events-none",style:{background:"linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 45%)"}})]})}function H(){return u.useEffect(()=>{const t=["#7DD3FC","#F472B6","#FBBF24","#A78BFA","#34D399","#FF8C42"];let r=0,a=0;const s=n=>{const o=performance.now();o-r<16||(r=o,a=requestAnimationFrame(()=>{const i=t[Math.floor(Math.random()*t.length)],l=document.createElement("span");l.className="mouse-sparkle-life";const c=6+Math.random()*5;l.style.cssText=`position:fixed;left:${n.clientX}px;top:${n.clientY}px;width:${c}px;height:${c}px;border-radius:50%;background:radial-gradient(circle,#fff 0%,${i} 50%,transparent 100%);pointer-events:none;z-index:99999;box-shadow:0 0 10px ${i};`,document.body.appendChild(l),setTimeout(()=>l.remove(),950)}))};return window.addEventListener("mousemove",s,{passive:!0}),()=>{window.removeEventListener("mousemove",s),cancelAnimationFrame(a)}},[]),null}function G(t,r,a){const s=["#7DD3FC","#F472B6","#FBBF24","#A78BFA","#34D399",a],n=14;for(let o=0;o<n;o++){const i=o/n*Math.PI*2+(Math.random()-.5)*.4,l=70+Math.random()*55,c=Math.cos(i)*l,p=Math.sin(i)*l-25,d=document.createElement("span");d.className="tab-confetti-life";const x=s[o%s.length],m=5+Math.random()*4;d.style.cssText=`position:fixed;left:${t}px;top:${r}px;width:${m}px;height:${m}px;border-radius:50%;background:${x};pointer-events:none;z-index:99998;box-shadow:0 0 9px ${x};--dx:${c}px;--dy:${p}px;`,document.body.appendChild(d),setTimeout(()=>d.remove(),1e3)}}function U(){const t=["🌸","✨","🍂","❄️","🌿","💫","🌺"];return e.jsxs("div",{className:"fixed inset-0 pointer-events-none overflow-hidden","aria-hidden":"true",style:{zIndex:0},children:[e.jsx("div",{className:"absolute inset-0",style:{background:`
          radial-gradient(ellipse 700px 500px at 18% 28%, rgba(125,211,252,0.20), transparent 60%),
          radial-gradient(ellipse 600px 400px at 78% 18%, rgba(244,114,182,0.14), transparent 60%),
          radial-gradient(ellipse 800px 500px at 50% 88%, rgba(251,191,36,0.16), transparent 60%),
          radial-gradient(ellipse 500px 350px at 8% 78%, rgba(167,139,250,0.12), transparent 60%),
          radial-gradient(ellipse 400px 300px at 90% 65%, rgba(52,211,153,0.10), transparent 60%)
        `,backgroundSize:"180% 180%",filter:"blur(28px)",animation:"cosmic-aurora 24s ease-in-out infinite alternate"}}),Array.from({length:24}).map((r,a)=>{const s=t[a%t.length],n=a*7.3%100,o=11+a%4*2.5,i=a%7*1.1,l=12+a%3*5;return e.jsx("span",{"aria-hidden":!0,className:"absolute",style:{left:`${n}%`,bottom:-40,fontSize:l,opacity:0,animation:`petal-float-up ${o}s linear ${i}s infinite`,filter:`drop-shadow(0 0 8px rgba(255,255,255,0.4)) hue-rotate(${a*30}deg)`},children:s},a)})]})}function P(){const t=u.useRef(null),[r,a]=u.useState(!1);return u.useEffect(()=>{const s=t.current;if(!s)return;const n=new IntersectionObserver(([o])=>{o.isIntersecting&&(a(!0),n.disconnect())},{threshold:.15,rootMargin:"0px 0px -40px 0px"});return n.observe(s),()=>n.disconnect()},[]),{ref:t,visible:r}}const W={UPCOMING:{label:"COMING",icon:"⏳",from:"#1E3A8A",mid:"#60A5FA",to:"#7DD3FC",text:"#fff",glow:"rgba(96,165,250,0.5)",border:"rgba(125,211,252,0.4)"},SEDANG_TAYANG:{label:"ON AIR",icon:"🔴",from:"#065F46",mid:"#10B981",to:"#34D399",text:"#fff",glow:"rgba(52,211,153,0.55)",border:"rgba(52,211,153,0.4)"},SUDAH_RILIS:{label:"SUDAH RILIS",icon:"✅",from:"#92400E",mid:"#F59E0B",to:"#FBBF24",text:"#fff",glow:"rgba(251,191,36,0.55)",border:"rgba(251,191,36,0.4)"},SUDAH_TAMAT:{label:"TAMAT",icon:"🏁",from:"#581C87",mid:"#8B5CF6",to:"#A78BFA",text:"#fff",glow:"rgba(167,139,250,0.5)",border:"rgba(167,139,250,0.4)"},TBA:{label:"SEGERA",icon:"📅",from:"#1F2937",mid:"#475569",to:"#64748B",text:"#D1D5DB",glow:"rgba(148,163,184,0.25)",border:"rgba(148,163,184,0.3)"}};function O({status:t}){const r=W[t];return e.jsx("div",{className:"absolute top-2 right-2 z-10",style:{animation:"tamat-seal-glow 2.4s ease-in-out infinite"},children:e.jsxs("div",{className:"flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-l-full",style:{background:`linear-gradient(135deg, ${r.from} 0%, ${r.mid} 30%, ${r.to} 50%, ${r.from} 70%, ${r.from})`,backgroundSize:"200% 200%",animation:"shimmer-gold 2.8s linear infinite",color:r.text,boxShadow:`0 2px 10px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.4), 0 0 8px ${r.glow}`,border:`1px solid ${r.border}`},children:[e.jsx("span",{style:{fontSize:11},children:r.icon}),e.jsx("span",{style:{fontSize:9,fontWeight:900,letterSpacing:"0.04em",textShadow:"0 0 4px rgba(0,0,0,0.5)"},children:r.label})]})})}function q({airingAt:t}){if(C(1e3),!t)return null;const r=Math.max(0,t-Math.floor(Date.now()/1e3)),a=Y(r);return e.jsxs("div",{className:"inline-flex items-center gap-1.5",style:{padding:"4px 8px",borderRadius:9999,background:"linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,58,95,0.7))",border:"1px solid rgba(96,165,250,0.45)",backdropFilter:"blur(8px)",animation:"countdown-glow 2.4s ease-in-out infinite",maxWidth:"100%"},children:[e.jsx("span",{style:{animation:"countdown-blink 1.6s steps(1) infinite",fontSize:11},children:"⏳"}),e.jsx("span",{className:"text-[10px] font-black tabular-nums truncate",style:{color:"#7DD3FC",letterSpacing:"0.02em"},children:a})]})}function J({anime:t,accent:r}){const[,a]=M(),s=E(t.id),n=T(),o=t.airingAt??null,i=o!==null?1:null,l=t.title.english||t.title.romaji,c=o?z({unix:o}):null,p=(t.genres??[]).slice(0,2),d=v(o,t.status),{ref:x,visible:m}=P();return e.jsx("div",{ref:x,className:`relative reveal-on-scroll ${m?"is-visible":""}`,style:{perspective:600,willChange:"transform, opacity"},children:e.jsxs("div",{className:"lux-shine flex-shrink-0 cursor-pointer","data-testid":`season-card-${t.id}`,style:{transition:"transform 0.15s ease",willChange:"transform"},...n,onClick:()=>a(`/upcoming/${t.id}`),children:[e.jsxs("div",{className:`lux-wrap lux-v${s}`,style:{position:"relative"},children:[e.jsx($,{color:B[s].glow,variant:s}),e.jsxs("div",{className:"relative overflow-hidden rounded-xl",style:{boxShadow:"0 4px 20px rgba(0,0,0,0.6)",background:"#050510"},children:[e.jsx(_,{anime:t}),e.jsxs("div",{className:"absolute bottom-2 left-2 flex flex-col gap-[3px] z-10",children:[i!=null&&e.jsxs("span",{className:"text-[10px] font-bold px-1.5 py-[2px] rounded-full w-fit",style:{background:"rgba(255,107,0,0.85)",backdropFilter:"blur(8px)",color:"#fff",boxShadow:"0 0 8px rgba(255,107,0,0.4)"},children:["EP ",i]}),(t.seasonYear!=null||t.averageScore!=null)&&e.jsxs("span",{className:"text-[9px] font-medium px-1.5 py-[2px] rounded-full w-fit whitespace-nowrap",style:{background:"rgba(0,0,0,0.60)",backdropFilter:"blur(4px)",color:"rgba(255,255,255,0.88)",lineHeight:1.2},children:[t.averageScore!=null&&`🌟${(t.averageScore/10).toFixed(1)}`,t.averageScore!=null&&t.seasonYear!=null&&" · ",t.seasonYear!=null&&`🗓 ${t.seasonYear}`]})]}),e.jsx(O,{status:d})]})]}),e.jsx("p",{className:"mt-1.5 text-xs font-semibold text-white line-clamp-2 leading-tight px-0.5",children:l}),p.length>0&&e.jsx("div",{className:"mt-1 flex flex-wrap gap-1 px-0.5",children:p.map(y=>e.jsx("span",{className:"text-[9px] font-semibold px-1.5 py-[2px] rounded-full",style:{background:`${r}1a`,color:r,border:`1px solid ${r}33`,boxShadow:`0 0 6px ${r}22`},children:y},y))}),e.jsxs("div",{className:"mt-1.5 flex flex-col gap-0.5 px-0.5",children:[d==="UPCOMING"&&o&&e.jsxs(e.Fragment,{children:[e.jsx(q,{airingAt:o}),c&&e.jsxs("span",{className:"text-[9px] font-medium truncate",style:{color:"rgba(255,255,255,0.55)"},children:["📅 ",c]})]}),d==="SEDANG_TAYANG"&&e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"text-[10px] font-black px-2 py-1 rounded-full w-fit",style:{background:"rgba(52,211,153,0.18)",color:"#34D399",border:"1px solid rgba(52,211,153,0.35)"},children:"🟢 ON AIR — episode pertama tayang"}),c&&e.jsxs("span",{className:"text-[9px] font-medium truncate",style:{color:"rgba(255,255,255,0.55)"},children:["📅 sejak ",c]})]}),d==="SUDAH_RILIS"&&c&&e.jsxs("span",{className:"text-[10px] font-black px-2 py-1 rounded-full w-fit",style:{background:"rgba(251,191,36,0.18)",color:"#FBBF24",border:"1px solid rgba(251,191,36,0.35)"},children:["📅 Tayang ",c]}),d==="SUDAH_TAMAT"&&e.jsx("span",{className:"text-[10px] font-black px-2 py-1 rounded-full w-fit",style:{background:"rgba(167,139,250,0.18)",color:"#A78BFA",border:"1px solid rgba(167,139,250,0.35)"},children:"🏁 Sudah tamat"}),d==="TBA"&&e.jsx("span",{className:"text-[10px] font-black px-2 py-1 rounded-full w-fit",style:{background:"rgba(148,163,184,0.16)",color:"#94A3B8",border:"1px solid rgba(148,163,184,0.35)"},children:"📅 Tanggal rilis belum diumumkan"})]})]})})}function K({sk:t,accent:r,count:a,isFirst:s,source:n}){const o=f[t.season],i=n&&n!=="MAL"&&n!=="none";return e.jsxs("div",{className:"flex items-center gap-3 mb-3 sticky z-20 py-3 px-4 -mx-4 mt-1",style:{top:s?0:56,background:"linear-gradient(to bottom, rgba(5,5,16,0.96), rgba(5,5,16,0.85))",backdropFilter:"blur(20px)",borderBottom:`1px solid ${r}22`},children:[e.jsx("div",{className:"text-2xl",style:{filter:`drop-shadow(0 0 8px ${r}aa)`},children:o.emoji}),e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsxs("h2",{className:"holo-title text-lg font-black truncate",style:{letterSpacing:"-0.01em"},children:[o.label," ",t.year]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs("p",{className:"text-[10px] font-semibold uppercase tracking-wider",style:{color:r},children:[o.jpeg," • ",a," judul lineup"]}),i&&e.jsx("span",{className:"text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider",title:"MAL/JIKAN sedang tidak tersedia — lineup dari AniList sebagai backup",style:{background:"rgba(251,191,36,0.15)",color:"rgba(251,191,36,0.9)",border:"1px solid rgba(251,191,36,0.35)",letterSpacing:"0.06em"},children:"via AniList"})]})]}),e.jsx("span",{className:"text-[10px] font-black px-2.5 py-1 rounded-full flex-shrink-0",style:{background:`linear-gradient(135deg, ${r}33, ${r}1a)`,backgroundSize:"200% 200%",animation:"shimmer-gold 3s linear infinite",color:r,border:`1px solid ${r}55`,boxShadow:`0 0 14px ${j[t.season]}`},children:t.year})]})}function V({sk:t,accent:r,isFirst:a,searchFilter:s}){const{data:n,isLoading:o,isFetching:i,refetch:l}=F({queryKey:["season-lineup",t.season,t.year],queryFn:()=>h(t),staleTime:36e5,retry:3,retryDelay:p=>Math.min(1e3*(p+1),4e3)}),c=u.useMemo(()=>{if(!n)return[];const p=new Set,d=n.data.filter(g=>!g.id||p.has(g.id)?!1:(p.add(g.id),!0)),x=Date.now(),m=s.trim().toLowerCase();return(m?d.filter(g=>(g.title?.english||g.title?.romaji||"").toLowerCase().includes(m)):d).sort((g,b)=>{const w=A[v(g.airingAt,g.status,x)],k=A[v(b.airingAt,b.status,x)];if(w!==k)return w-k;const S=g.airingAt??Number.MAX_SAFE_INTEGER,N=b.airingAt??Number.MAX_SAFE_INTEGER;return S!==N?S-N:(b.popularity??0)-(g.popularity??0)})},[n,s]);return e.jsxs("section",{className:"mb-8","data-testid":`season-section-${t.season}-${t.year}`,children:[e.jsx(K,{sk:t,accent:r,count:c.length,isFirst:a,source:n?.source}),o&&e.jsx("div",{className:"grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 px-1",children:Array.from({length:8}).map((p,d)=>e.jsx("div",{className:"lux-wrap",style:{animation:"pulse 1.5s ease-in-out infinite",opacity:.5},children:e.jsx("div",{className:"rounded-xl",style:{aspectRatio:"2/3",background:"linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",minHeight:160}})},d))}),!o&&c.length===0&&(n?.error?e.jsxs("div",{className:"text-center py-6 space-y-3",children:[e.jsxs("p",{className:"text-xs",style:{color:"rgba(251,191,36,0.85)"},children:["Lineup MAL sedang dimuat ulang untuk ",f[t.season].label," ",t.year,"."]}),e.jsx("button",{type:"button",onClick:()=>l(),disabled:i,className:"px-4 py-2 rounded-full text-xs font-black",style:{color:r,border:`1px solid ${r}88`,background:`${r}18`},children:i?"Mencoba lagi…":"Coba lagi"})]}):e.jsxs("div",{className:"text-center py-6 space-y-1",children:[e.jsxs("p",{className:"text-xs",style:{color:"rgba(255,255,255,0.55)"},children:["Sepertinya semua lineup ",f[t.season].label," ",t.year," sudah mulai tayang."]}),e.jsxs("p",{className:"text-[10px]",style:{color:"rgba(255,255,255,0.4)"},children:["Lihat tab ",e.jsx("span",{style:{color:"rgba(125,211,252,0.85)"},children:"Jadwal"})," untuk episode terbaru 📺"]})]})),c.length>0&&e.jsx("div",{className:"grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 px-1",children:c.map(p=>e.jsx(J,{anime:p,accent:r},p.id))})]})}function Q({query:t,onChange:r}){return e.jsx("div",{className:"mb-3 px-1",children:e.jsxs("div",{className:"relative flex items-center","data-testid":"season-search-wrap",children:[e.jsx("span",{className:"absolute left-3 top-1/2 -translate-y-1/2 text-base pointer-events-none select-none",style:{filter:"drop-shadow(0 0 7px rgba(125,211,252,0.55))"},children:"🔍"}),e.jsx("input",{type:"text",value:t,onChange:a=>r(a.target.value),placeholder:"Cari anime di musim ini…","data-testid":"season-search-input",className:"w-full pl-9 pr-9 py-2.5 rounded-xl text-[13px] font-semibold outline-none",style:{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.10)",color:"#F8FAFC",letterSpacing:"0.005em",transition:"all 0.18s ease"},onFocus:a=>{a.currentTarget.style.background="rgba(255,255,255,0.10)",a.currentTarget.style.borderColor="rgba(125,211,252,0.55)",a.currentTarget.style.boxShadow="0 0 14px rgba(125,211,252,0.18)"},onBlur:a=>{a.currentTarget.style.background="rgba(255,255,255,0.06)",a.currentTarget.style.borderColor="rgba(255,255,255,0.10)",a.currentTarget.style.boxShadow="none"}}),t&&e.jsx("button",{type:"button",onClick:()=>r(""),"aria-label":"Clear search","data-testid":"season-search-clear",className:"absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full font-bold",style:{background:"rgba(255,255,255,0.10)",color:"#F8FAFC",lineHeight:1,border:"1px solid rgba(255,255,255,0.18)",transition:"all 0.15s ease"},onMouseEnter:a=>{a.currentTarget.style.background="rgba(244,114,182,0.30)"},onMouseLeave:a=>{a.currentTarget.style.background="rgba(255,255,255,0.10)"},children:"×"})]})})}function Z({activeIdx:t,onChange:r,seasons:a}){return e.jsx("div",{className:"flex gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1.5 -mx-1 px-1",children:a.map((s,n)=>{const o=f[s.season],i=o.accent,l=t===n,{data:c}=F({queryKey:["season-lineup",s.season,s.year],queryFn:()=>h(s),staleTime:60*6e4}),p=(c?.data??[]).length;return e.jsxs("button",{onClick:d=>{r(n);const x=d.currentTarget.getBoundingClientRect();G(x.left+x.width/2,x.top+x.height/2,l?"#7DD3FC":"#F472B6")},className:`season-tab-pill flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full card-press ${l?"is-active":""}`,"data-testid":`season-tab-${s.season}-${s.year}`,style:{background:l?`linear-gradient(135deg, ${i}33, ${i}1a)`:"rgba(255,255,255,0.04)",color:l?"#F8FAFC":"#94A3B8",border:l?`1px solid ${i}55`:"1px solid rgba(255,255,255,0.07)",transition:"all 0.18s ease",boxShadow:l?`0 0 14px ${j[s.season]}`:"none",fontWeight:800,fontSize:11,letterSpacing:"0.01em"},children:[e.jsxs("span",{style:{filter:l?`drop-shadow(0 0 6px ${i}77)`:"none",whiteSpace:"nowrap"},children:[o.emoji," ",o.label," ",s.year]}),e.jsx("span",{className:"inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[9px] font-black tabular-nums",style:{background:l?`${i}22`:"rgba(255,255,255,0.06)",color:l?i:"#64748B",minWidth:18,border:l?`1px solid ${i}33`:"none"},children:p})]},`${s.season}-${s.year}`)})})}function le(){u.useEffect(()=>{X()},[]),C(6e4);const t=D(),r=u.useMemo(()=>L(),[]),[a,s]=u.useState(()=>new Date),[n,o]=u.useState(0),[i,l]=u.useState(""),c=r[n],p=f[c.season].accent;return u.useEffect(()=>{r.forEach(d=>{t.prefetchQuery({queryKey:["season-lineup",d.season,d.year],queryFn:()=>h(d),staleTime:60*6e4})})},[t,r]),e.jsxs("div",{className:"min-h-screen pb-28 px-3 pt-4 relative",style:{background:"#05050f"},children:[e.jsx("style",{children:`
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
      `}),e.jsx(U,{}),e.jsx(H,{}),e.jsxs("div",{className:"relative z-10",children:[e.jsxs("header",{className:"mb-4 px-1",children:[e.jsxs("div",{className:"flex items-end justify-between mb-1",children:[e.jsx("h1",{className:"text-2xl font-black text-white tracking-tight",style:{textShadow:"0 0 14px rgba(125,211,252,0.5)"},children:"🗓 Musim"}),e.jsx("span",{className:"text-[10px] font-semibold uppercase tracking-wider",style:{color:"rgba(255,255,255,0.5)"},children:a.toLocaleDateString("id-ID",{weekday:"short",day:"numeric",month:"short",year:"numeric"})})]}),e.jsx("p",{className:"text-xs",style:{color:"rgba(255,255,255,0.6)"},children:"4 musim ke depan • lineup + hitung mundur akurat ke detik. Update tiap jam."})]}),e.jsx(re,{activeSk:c,isFirst:n===0}),e.jsx(Q,{query:i,onChange:l}),e.jsx(Z,{activeIdx:n,onChange:o,seasons:r}),e.jsx(V,{sk:c,accent:p,isFirst:!0,searchFilter:i})]})]})}const ee={WINTER:"radial-gradient(ellipse at 30% 18%, #38BDF8 0%, #1E40AF 30%, #0F172A 70%, #020617 100%)",SPRING:"radial-gradient(ellipse at 50% 22%, #F472B6 0%, #BE185D 30%, #831843 70%, #1E1B4B 100%)",SUMMER:"radial-gradient(ellipse at 60% 18%, #FEF08A 0%, #FBBF24 22%, #F59E0B 50%, #B45309 80%, #7C2D12 100%)",FALL:"radial-gradient(ellipse at 70% 20%, #FB923C 0%, #EA580C 28%, #9A3412 65%, #450A0A 100%)"},te={WINTER:{kind:"snow",count:30},SPRING:{kind:"sakura",count:22},SUMMER:{kind:"sun",count:14},FALL:{kind:"leafs",count:24}},ae={WINTER:"linear-gradient(110deg, #E0F2FE 0%, #7DD3FC 30%, #BAE6FD 50%, #7DD3FC 70%, #E0F2FE 100%)",SPRING:"linear-gradient(110deg, #FDF2F8 0%, #F472B6 35%, #FBCFE8 55%, #F472B6 75%, #FDF2F8 100%)",SUMMER:"linear-gradient(110deg, #FEF3C7 0%, #FBBF24 30%, #FDE68A 50%, #F59E0B 75%, #FEF3C7 100%)",FALL:"linear-gradient(110deg, #FED7AA 0%, #FB923C 30%, #FCA5A5 55%, #EA580C 75%, #FED7AA 100%)"};function re({activeSk:t,isFirst:r}){const a=t,s=f[a.season],n=s.accent,o=E(`hero-${a.season}-${a.year}`),i=T(),[l,c]=u.useState(!1),p=u.useRef(null);u.useEffect(()=>{c(!1),p.current&&p.current.load()},[a.season]);const{data:d}=F({queryKey:["season-lineup",a.season,a.year],queryFn:()=>h(a),staleTime:60*6e4}),x=d?.data?.length??0;te[a.season];const m=`/Jumalia-Makruf/anime/banners/season-${a.season.toLowerCase()}.mp4`;return e.jsx("div",{className:"mb-5 cursor-pointer relative",style:{transition:"transform 0.15s ease",willChange:"transform"},...i,children:e.jsxs("div",{className:`lux-wrap lux-v${o}`,children:[e.jsx($,{color:B[o].glow,variant:o}),e.jsxs("div",{className:"rounded-2xl relative overflow-hidden",style:{background:ee[a.season],minHeight:168,backdropFilter:"blur(20px)"},children:[!l&&e.jsx("video",{ref:p,autoPlay:!0,muted:!0,loop:!0,playsInline:!0,onError:()=>c(!0),className:"absolute inset-0 w-full h-full pointer-events-none",style:{objectFit:"cover",opacity:1,zIndex:0},children:e.jsx("source",{src:m,type:"video/mp4"})},a.season),e.jsxs("div",{className:"relative z-10 p-5",style:{zIndex:3},children:[e.jsx("p",{className:"text-[10px] font-black uppercase tracking-widest",style:{color:"#F8FAFC",textShadow:`0 0 8px ${n}cc`},children:r?"Musim Mendatang":`Musim ${s.label}`}),e.jsxs("h2",{className:"text-2xl font-black mt-1 leading-tight relative inline-block",style:{background:ae[a.season],backgroundSize:"200% 100%",WebkitBackgroundClip:"text",backgroundClip:"text",color:"transparent",WebkitTextFillColor:"transparent",animation:"holo-shift 4.5s linear infinite",filter:`drop-shadow(0 0 14px ${n}77)`},children:[s.emoji," ",s.label," ",a.year]}),e.jsxs("p",{className:"text-xs font-bold mt-1.5 relative",style:{color:"rgba(255,255,255,0.92)",textShadow:"0 1px 6px rgba(0,0,0,0.5)"},children:[s.jpeg," • ",x," judul lineup"]}),e.jsx("div",{className:"mt-3 inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-full relative",style:{background:`linear-gradient(135deg, ${n}44, ${n}22)`,backgroundSize:"200% 200%",animation:"shimmer-gold 3s linear infinite",color:"#F8FAFC",border:`1px solid ${n}aa`,boxShadow:`0 0 18px ${j[a.season]}, inset 0 1px 0 rgba(255,255,255,0.20)`,letterSpacing:"0.05em",textShadow:`0 0 8px ${n}aa`},children:"VIEW LINEUP ↓"})]})]})]})})}export{le as default};
