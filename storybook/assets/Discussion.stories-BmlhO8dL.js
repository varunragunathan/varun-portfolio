import{u as ie,d as ce,r as o,j as e,A as re}from"./iframe-BAbMR1lQ.js";import{w as E,a as te,e as m}from"./index-IPsTsOz-.js";import{L as C}from"./Discussion-DmkYtV4x.js";import"./preload-helper-Dp1pzeXC.js";import"./index-D7VDZnXr.js";import"./index-wOlLjlKW.js";const de=50;function le(t){return new Date(t).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}function ue({onCreated:t,onCancel:n}){const[c,u]=o.useState(""),[f,w]=o.useState(""),[T,p]=o.useState(""),[j,_]=o.useState(!1),S=async d=>{if(d.preventDefault(),!c.trim()||!f.trim()){p("Both fields required.");return}_(!0),p("");const h=await fetch("/api/discussion/topics",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:c.trim(),body:f.trim()})}),g=await h.json();if(_(!1),!h.ok){p(g.error||"Failed to post.");return}t(g.id)};return e.jsxs("form",{className:"disc-new-form",onSubmit:S,children:[e.jsx("h2",{className:"disc-new-form__title",children:"Start a topic"}),T&&e.jsx("p",{className:"disc-new-form__error",role:"alert",children:T}),e.jsx("label",{htmlFor:"disc-new-title",className:"disc-sr-only",children:"Topic title"}),e.jsx("input",{id:"disc-new-title",className:"disc-new-form__input",placeholder:"Title",value:c,onChange:d=>u(d.target.value),maxLength:200}),e.jsx("label",{htmlFor:"disc-new-body",className:"disc-sr-only",children:"Topic body"}),e.jsx("textarea",{id:"disc-new-body",className:"disc-new-form__body",placeholder:"What's on your mind?",value:f,onChange:d=>w(d.target.value),rows:6}),e.jsxs("div",{className:"disc-new-form__actions",children:[e.jsx("button",{type:"submit",className:"disc-btn disc-btn--primary",disabled:j,children:j?"Posting…":"Post"}),e.jsx("button",{type:"button",className:"disc-btn disc-btn--ghost",onClick:n,children:"Cancel"})]})]})}function se(){const{user:t}=ie(),n=ce(),[c,u]=o.useState([]),[f,w]=o.useState(!0),[T,p]=o.useState(!1),[j,_]=o.useState(!1),[S,d]=o.useState(!1);o.useEffect(()=>{const s=document.title;document.title="Discussion — varunr.dev";const a=document.querySelector('meta[name="description"]'),r=document.querySelector('meta[property="og:title"]'),i=document.querySelector('meta[property="og:description"]'),l=document.querySelector('meta[property="og:url"]'),D=a==null?void 0:a.getAttribute("content"),M=r==null?void 0:r.getAttribute("content"),O=i==null?void 0:i.getAttribute("content");return a&&a.setAttribute("content","Open discussion board on varunr.dev. Anyone can read; sign in to start a topic or leave a reply."),r&&r.setAttribute("content","Discussion — varunr.dev"),i&&i.setAttribute("content","Open discussion board on varunr.dev. Anyone can read; sign in to participate."),l&&l.setAttribute("content","https://varunr.dev/discussion"),()=>{document.title=s,a&&D&&a.setAttribute("content",D),r&&M&&r.setAttribute("content",M),i&&O&&i.setAttribute("content",O),l&&l.setAttribute("content","https://varunr.dev")}},[]);const h=o.useRef(0),g=o.useRef(!1),N=o.useRef(!1),A=o.useRef(null),oe=o.useRef(de),B=o.useCallback(async(s,a)=>{if(!N.current){N.current=!0,a?p(!0):w(!0);try{const i=await(await fetch(`/api/discussion/topics?limit=${oe.current}&offset=${s}`)).json(),l=i.topics||[];u(a?D=>[...D,...l]:l),h.current=s+l.length,g.current=i.hasMore??!1,_(i.hasMore??!1)}finally{N.current=!1,a?p(!1):w(!1)}}},[]);o.useEffect(()=>{h.current=0,B(0,!1)},[B]),o.useEffect(()=>{const s=A.current;if(!s)return;const a=new IntersectionObserver(r=>{r[0].isIntersecting&&g.current&&!N.current&&B(h.current,!0)},{rootMargin:"300px"});return a.observe(s),()=>a.disconnect()},[B]);const ae=s=>n(`/discussion/${s}`);return e.jsxs("div",{className:"disc-page",children:[e.jsxs("div",{className:"disc-header",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"disc-header__title",children:"Discussion"}),e.jsx("p",{className:"disc-header__sub",children:"Start a topic or join the conversation."})]}),t&&!S&&e.jsx("button",{className:"disc-btn disc-btn--primary",onClick:()=>d(!0),children:"+ New topic"})]}),S&&e.jsx(ue,{onCreated:ae,onCancel:()=>d(!1)}),f?e.jsx("div",{className:"disc-empty",role:"status","aria-live":"polite",children:"Loading…"}):c.length===0?e.jsxs("div",{className:"disc-empty",children:["No topics yet.",t?" Be the first to start one.":" Sign in to start one."]}):e.jsxs(e.Fragment,{children:[e.jsx("ul",{className:"disc-topic-list",children:c.map(s=>e.jsx("li",{children:e.jsxs(C,{to:`/discussion/${s.id}`,className:"disc-topic-card",children:[s.pinned&&e.jsx("span",{className:"disc-topic-card__pin",children:"Pinned"}),e.jsx("span",{className:"disc-topic-card__title",children:s.title}),e.jsxs("span",{className:"disc-topic-card__meta",children:[s.author," · ",le(s.created_at),s.comment_count>0&&e.jsxs("span",{className:"disc-topic-card__count",children:[s.comment_count," ",s.comment_count===1?"reply":"replies"]})]})]})},s.id))}),e.jsx("div",{ref:A,className:"disc-sentinel"}),T&&e.jsx("div",{className:"disc-loading-more",role:"status","aria-live":"polite",children:"Loading…"}),!j&&c.length>0&&e.jsx("p",{className:"disc-list-end",children:"You've reached the end."})]}),!t&&e.jsxs("p",{className:"disc-auth-nudge",children:[e.jsx(C,{to:"/auth",children:"Sign in"})," to join the discussion."]})]})}se.__docgenInfo={description:"",methods:[],displayName:"DiscussionPage"};const ne=[{id:"topic-1",title:"Thought of the day",author:"bold-bear-38",created_at:new Date(Date.now()-2*36e5).toISOString(),comment_count:4,pinned:!0},{id:"topic-2",title:"What AI tools do you use daily?",author:"swift-fox-12",created_at:new Date(Date.now()-24*36e5).toISOString(),comment_count:7,pinned:!1},{id:"topic-3",title:"Best practices for code review",author:"calm-owl-55",created_at:new Date(Date.now()-48*36e5).toISOString(),comment_count:0,pinned:!1}];function pe(t){return e.jsx(re,{children:e.jsx(t,{})})}function I(t){const n=globalThis.fetch;return globalThis.fetch=async(c,...u)=>String(c).includes("/api/discussion/topics")?new Response(JSON.stringify(t),{status:200,headers:{"Content-Type":"application/json"}}):n(c,...u),()=>{globalThis.fetch=n}}const be={title:"Discussion/TopicList",component:se,tags:["autodocs"],decorators:[pe],parameters:{docs:{description:{component:"Discussion topic list with infinite scroll and optional new-topic form."}}}},y={beforeEach(){return I({topics:ne,hasMore:!1})},play:async({canvasElement:t})=>{const n=E(t);await te(()=>n.getByText("Thought of the day"),{timeout:3e3}),await m(n.getByText("Thought of the day")).toBeInTheDocument(),await m(n.getByText("What AI tools do you use daily?")).toBeInTheDocument(),await m(n.getByText("Pinned")).toBeInTheDocument(),await m(n.getByText("4 replies")).toBeInTheDocument()}},x={beforeEach(){return I({topics:[],hasMore:!1})},play:async({canvasElement:t})=>{const n=E(t);await te(()=>n.getByText(/No topics yet/),{timeout:3e3}),await m(n.getByText(/No topics yet/)).toBeInTheDocument()}},b={beforeEach(){return I({topics:ne,hasMore:!0})}},v={beforeEach(){const t=globalThis.fetch;return globalThis.fetch=async()=>new Promise(()=>{}),()=>{globalThis.fetch=t}},play:async({canvasElement:t})=>{const n=E(t);await m(n.getByText("Loading…")).toBeInTheDocument()}};var P,L,F,R,k;y.parameters={...y.parameters,docs:{...(P=y.parameters)==null?void 0:P.docs,source:{originalSource:`{
  beforeEach() {
    return mockFetch({
      topics: MOCK_TOPICS,
      hasMore: false
    });
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByText('Thought of the day'), {
      timeout: 3000
    });
    await expect(canvas.getByText('Thought of the day')).toBeInTheDocument();
    await expect(canvas.getByText('What AI tools do you use daily?')).toBeInTheDocument();
    await expect(canvas.getByText('Pinned')).toBeInTheDocument();
    await expect(canvas.getByText('4 replies')).toBeInTheDocument();
  }
}`,...(F=(L=y.parameters)==null?void 0:L.docs)==null?void 0:F.source},description:{story:"Topics loaded — shows pinned badge, reply counts, and the list",...(k=(R=y.parameters)==null?void 0:R.docs)==null?void 0:k.description}}};var W,q,$,H,K;x.parameters={...x.parameters,docs:{...(W=x.parameters)==null?void 0:W.docs,source:{originalSource:`{
  beforeEach() {
    return mockFetch({
      topics: [],
      hasMore: false
    });
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByText(/No topics yet/), {
      timeout: 3000
    });
    await expect(canvas.getByText(/No topics yet/)).toBeInTheDocument();
  }
}`,...($=(q=x.parameters)==null?void 0:q.docs)==null?void 0:$.source},description:{story:"Empty board — guest-friendly message",...(K=(H=x.parameters)==null?void 0:H.docs)==null?void 0:K.description}}};var J,U,G,Y,Z;b.parameters={...b.parameters,docs:{...(J=b.parameters)==null?void 0:J.docs,source:{originalSource:`{
  beforeEach() {
    return mockFetch({
      topics: MOCK_TOPICS,
      hasMore: true
    });
  }
}`,...(G=(U=b.parameters)==null?void 0:U.docs)==null?void 0:G.source},description:{story:"Pagination available — shows that more topics exist beyond this page",...(Z=(Y=b.parameters)==null?void 0:Y.docs)==null?void 0:Z.description}}};var z,Q,V,X,ee;v.parameters={...v.parameters,docs:{...(z=v.parameters)==null?void 0:z.docs,source:{originalSource:`{
  beforeEach() {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => new Promise(() => {}); // never resolves
    return () => {
      globalThis.fetch = orig;
    };
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Loading…')).toBeInTheDocument();
  }
}`,...(V=(Q=v.parameters)==null?void 0:Q.docs)==null?void 0:V.source},description:{story:"Loading state — spinner before data arrives",...(ee=(X=v.parameters)==null?void 0:X.docs)==null?void 0:ee.description}}};const ve=["WithTopics","EmptyBoard","HasMore","Loading"];export{x as EmptyBoard,b as HasMore,v as Loading,y as WithTopics,ve as __namedExportsOrder,be as default};
