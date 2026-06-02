import{e as ae,u as ce,r as i,j as t,f as re,h as A}from"./iframe-Drxnu9rO.js";import{w as b,a as j,e as g}from"./index-IPsTsOz-.js";import{L as S}from"./Discussion-qRuAKMCp.js";import"./preload-helper-Dp1pzeXC.js";import"./index-YPX9vv1P.js";import"./index-CmKOD3Fc.js";function ie(e){const s={},n=[];for(const o of e)s[o.id]={...o,replies:[]};for(const o of e)o.parent_id&&s[o.parent_id]?s[o.parent_id].replies.push(s[o.id]):n.push(s[o.id]);return n}function te(e){const s=Date.now()-new Date(e).getTime(),n=Math.floor(s/1e3);if(n<60)return"just now";const o=Math.floor(n/60);if(o<60)return`${o}m ago`;const c=Math.floor(o/60);if(c<24)return`${c}h ago`;const m=Math.floor(c/24);return m<30?`${m}d ago`:new Date(e).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}const F=["#4338ca","#be185d","#c2410c","#047857","#1d4ed8","#6d28d9","#b91c1c","#0f766e"];function de(e){let s=0;for(let n=0;n<e.length;n++)s=s*31+e.charCodeAt(n)>>>0;return F[s%F.length]}function le(e){var n,o;const s=e.split(/[-_\s]/);return((((n=s[0])==null?void 0:n[0])??"")+(((o=s[1])==null?void 0:o[0])??"")).toUpperCase()}function ue({name:e,size:s=36}){return t.jsx("div",{className:"disc-avatar",style:{width:s,height:s,background:de(e),fontSize:Math.round(s*.36)},"aria-hidden":"true",children:le(e)})}function me({topicId:e,parentId:s,onPosted:n,onCancel:o}){const[c,m]=i.useState(""),[p,h]=i.useState(!1),[y,f]=i.useState(""),r=i.useRef(null);i.useEffect(()=>{var a;(a=r.current)==null||a.focus()},[]);const l=async()=>{if(!c.trim())return;h(!0),f("");const a=await fetch(`/api/discussion/topics/${e}/comments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:c.trim(),parent_id:s||null})}),d=await a.json();if(h(!1),!a.ok){f(d.error||"Failed to post.");return}n()},u=a=>{a.key==="Enter"&&(a.metaKey||a.ctrlKey)&&l()};return t.jsxs("div",{className:"disc-inline-reply",children:[y&&t.jsx("p",{className:"disc-inline-reply__error",role:"alert",children:y}),t.jsx("label",{htmlFor:`disc-reply-${s}`,className:"disc-sr-only",children:"Write a reply"}),t.jsx("textarea",{id:`disc-reply-${s}`,ref:r,className:"disc-inline-reply__input",placeholder:"Write a reply…",value:c,onChange:a=>m(a.target.value),onKeyDown:u,rows:3}),t.jsxs("div",{className:"disc-inline-reply__actions",children:[t.jsx("button",{className:"disc-btn disc-btn--primary disc-btn--sm",disabled:p||!c.trim(),onClick:l,children:p?"Posting…":"Post"}),t.jsx("button",{className:"disc-btn disc-btn--ghost disc-btn--sm",onClick:o,children:"Cancel"})]})]})}const pe=4;function se({comment:e,topicId:s,userId:n,onRefresh:o,depth:c=0}){var u,a;const[m,p]=i.useState(!1),[h,y]=i.useState(!1),f=async()=>{confirm("Delete this comment?")&&(await fetch(`/api/discussion/comments/${e.id}`,{method:"DELETE"}),o())},r=((u=e.replies)==null?void 0:u.length)>0,l=((a=e.replies)==null?void 0:a.length)??0;return t.jsxs("div",{className:"disc-comment-wrap",children:[t.jsxs("div",{className:"disc-comment-card",children:[t.jsxs("div",{className:"disc-comment-card__header",children:[t.jsx(ue,{name:e.author,size:36}),t.jsxs("div",{className:"disc-comment-card__name-row",children:[t.jsx("span",{className:"disc-comment-card__author",children:e.author}),t.jsx("span",{className:"disc-comment-card__time",children:te(e.created_at)})]})]}),e.deleted?t.jsx("p",{className:"disc-comment-card__deleted",children:"[deleted]"}):t.jsx("p",{className:"disc-comment-card__text",children:e.body}),!e.deleted&&t.jsxs("div",{className:"disc-comment-card__actions",children:[n&&t.jsx("button",{className:"disc-comment-card__action",onClick:()=>p(d=>!d),children:m?"Cancel":"Reply"}),n===e.author_id&&t.jsx("button",{className:"disc-comment-card__action disc-comment-card__action--delete",onClick:f,children:"Delete"}),r&&t.jsx("button",{className:"disc-comment-card__action disc-comment-card__action--collapse",onClick:()=>y(d=>!d),children:h?`Show ${l} ${l===1?"reply":"replies"}`:"Hide replies"})]}),m&&t.jsx(me,{topicId:s,parentId:e.id,onPosted:()=>{p(!1),o()},onCancel:()=>p(!1)})]}),!h&&r&&t.jsx("div",{className:`disc-comment-replies${c>=pe?" disc-comment-replies--flat":""}`,children:e.replies.map(d=>t.jsx(se,{comment:d,topicId:s,userId:n,onRefresh:o,depth:c+1},d.id))})]})}function he({topicId:e,onPosted:s}){const[n,o]=i.useState(""),[c,m]=i.useState(!1),[p,h]=i.useState(""),y=async()=>{if(!n.trim())return;m(!0),h("");const r=await fetch(`/api/discussion/topics/${e}/comments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:n.trim(),parent_id:null})}),l=await r.json();if(m(!1),!r.ok){h(l.error||"Failed to post.");return}o(""),s()},f=r=>{r.key==="Enter"&&(r.metaKey||r.ctrlKey)&&y()};return t.jsxs("div",{className:"disc-add-comment",children:[t.jsx("label",{htmlFor:"disc-add-comment-input",className:"disc-add-comment__label",children:"Add a comment"}),p&&t.jsx("p",{className:"disc-inline-reply__error",role:"alert",children:p}),t.jsxs("div",{className:"disc-add-comment__row",children:[t.jsx("textarea",{id:"disc-add-comment-input",className:"disc-add-comment__input",placeholder:"Write a comment…",value:n,onChange:r=>o(r.target.value),onKeyDown:f,rows:2}),t.jsx("button",{className:"disc-add-comment__post",disabled:c||!n.trim(),onClick:y,children:c?"…":"Post"})]})]})}function ne(){const{id:e}=ae(),{user:s}=ce(),[n,o]=i.useState(null),[c,m]=i.useState([]),[p,h]=i.useState(!0),[y,f]=i.useState(!1),r=i.useCallback(async()=>{const l=await fetch(`/api/discussion/topics/${e}`);if(l.status===404){f(!0),h(!1);return}const u=await l.json();o(u.topic),m(ie(u.comments||[])),h(!1)},[e]);return i.useEffect(()=>{r()},[r]),i.useEffect(()=>{if(!n)return;const l=document.title;document.title=`${n.title} — Discussion — varunr.dev`;const u=document.querySelector('meta[name="description"]'),a=document.querySelector('meta[property="og:title"]'),d=document.querySelector('meta[property="og:description"]'),v=document.querySelector('meta[property="og:url"]'),B=u==null?void 0:u.getAttribute("content"),C=a==null?void 0:a.getAttribute("content"),I=d==null?void 0:d.getAttribute("content"),k=n.body.length>150?n.body.slice(0,147)+"…":n.body;return u&&u.setAttribute("content",k),a&&a.setAttribute("content",`${n.title} — Discussion — varunr.dev`),d&&d.setAttribute("content",k),v&&v.setAttribute("content",`https://varunr.dev/discussion/${e}`),()=>{document.title=l,u&&B&&u.setAttribute("content",B),a&&C&&a.setAttribute("content",C),d&&I&&d.setAttribute("content",I),v&&v.setAttribute("content","https://varunr.dev")}},[n,e]),p?t.jsx("div",{className:"disc-page disc-empty",role:"status","aria-live":"polite",children:"Loading…"}):y?t.jsxs("div",{className:"disc-page disc-empty",children:["Topic not found. ",t.jsx(S,{to:"/discussion",children:"Back to discussion"})]}):t.jsxs("div",{className:"disc-page",children:[t.jsx(S,{to:"/discussion",className:"disc-back",children:"← Discussion"}),t.jsxs("article",{className:"disc-topic",children:[t.jsx("h1",{className:"disc-topic__title",children:n.title}),t.jsxs("div",{className:"disc-topic__meta",children:[t.jsx("span",{children:n.author}),t.jsx("span",{className:"disc-comment__dot",children:"·"}),t.jsx("span",{children:te(n.created_at)})]}),t.jsx("p",{className:"disc-topic__body",children:n.body})]}),t.jsxs("div",{className:"disc-thread",children:[t.jsx("div",{className:"disc-thread__header",children:t.jsxs("span",{className:"disc-thread__count",children:[n.comment_count," ",n.comment_count===1?"reply":"replies"]})}),s?t.jsx(he,{topicId:e,onPosted:r}):t.jsxs("p",{className:"disc-auth-nudge",style:{marginBottom:20,textAlign:"left"},children:[t.jsx(S,{to:"/auth",children:"Sign in"})," to join the discussion."]}),c.length===0?t.jsx("p",{className:"disc-empty disc-empty--inline",children:"No comments yet. Be the first!"}):t.jsx("div",{className:"disc-comments",children:c.map(l=>t.jsx(se,{comment:l,topicId:e,userId:s==null?void 0:s.userId,onRefresh:r,depth:0},l.id))})]})]})}ne.__docgenInfo={description:"",methods:[],displayName:"DiscussionThread"};const E={id:"topic-1",title:"Thought of the day",author:"bold-bear-38",created_at:new Date(Date.now()-2*36e5).toISOString(),body:'"Take up one idea. Make it your life." — Swami Vivekananda',comment_count:2,pinned:!1},oe=[{id:"c1",parent_id:null,depth:0,author:"swift-fox-12",author_id:"user-2",body:"Really resonates. Focused work beats scattered effort every time.",created_at:new Date(Date.now()-1*36e5).toISOString(),deleted:!1},{id:"c2",parent_id:"c1",depth:1,author:"calm-owl-55",author_id:"user-3",body:"Agreed — especially in the era of constant notifications.",created_at:new Date(Date.now()-30*6e4).toISOString(),deleted:!1}],ye=[...oe,{id:"c3",parent_id:null,depth:0,author:"[deleted]",author_id:"user-4",body:null,created_at:new Date(Date.now()-4*36e5).toISOString(),deleted:!0}];function N(e){return t.jsxs(re,{children:[t.jsx(A,{path:"/discussion/:id",element:t.jsx(e,{})}),t.jsx(A,{path:"/discussion",element:t.jsx("div",{children:"Discussion list"})})]})}function D(e,s){const n=globalThis.fetch;return globalThis.fetch=async(o,...c)=>String(o).includes("/api/discussion/topics/topic-1")?new Response(JSON.stringify({topic:e,comments:s}),{status:200,headers:{"Content-Type":"application/json"}}):n(o,...c),()=>{globalThis.fetch=n}}const ve={title:"Discussion/Thread",component:ne,tags:["autodocs"],parameters:{docs:{description:{component:"Thread view with recursive comment tree, avatars, and reply forms."}}}},T={parameters:{routerEntries:["/discussion/topic-1"]},decorators:[e=>N(e)],beforeEach(){return D(E,oe)},play:async({canvasElement:e})=>{const s=b(e);await j(()=>s.getByText("Thought of the day"),{timeout:3e3}),await g(s.getByText("Thought of the day")).toBeInTheDocument(),await g(s.getByText("swift-fox-12")).toBeInTheDocument(),await g(s.getByText("calm-owl-55")).toBeInTheDocument(),await g(s.getByText("Really resonates. Focused work beats scattered effort every time.")).toBeInTheDocument(),await g(s.getByText("SF")).toBeInTheDocument()}},x={parameters:{routerEntries:["/discussion/topic-1"]},decorators:[e=>N(e)],beforeEach(){return D(E,ye)},play:async({canvasElement:e})=>{const s=b(e);await j(()=>s.getByText("[deleted]",{selector:"p"}),{timeout:3e3}),await g(s.getByText("[deleted]",{selector:"p"})).toBeInTheDocument()}},_={parameters:{routerEntries:["/discussion/topic-1"]},decorators:[e=>N(e)],beforeEach(){return D({...E,comment_count:0},[])},play:async({canvasElement:e})=>{const s=b(e);await j(()=>s.getByText(/No comments yet/),{timeout:3e3}),await g(s.getByText(/No comments yet/)).toBeInTheDocument()}},w={parameters:{routerEntries:["/discussion/topic-1"]},decorators:[e=>N(e)],beforeEach(){const e=globalThis.fetch;return globalThis.fetch=async(s,...n)=>String(s).includes("/api/discussion/topics/")?new Response(JSON.stringify({error:"Not found"}),{status:404,headers:{"Content-Type":"application/json"}}):e(s,...n),()=>{globalThis.fetch=e}},play:async({canvasElement:e})=>{const s=b(e);await j(()=>s.getByText(/Topic not found/),{timeout:3e3}),await g(s.getByText(/Topic not found/)).toBeInTheDocument()}};var O,M,R,$,P;T.parameters={...T.parameters,docs:{...(O=T.parameters)==null?void 0:O.docs,source:{originalSource:`{
  parameters: {
    routerEntries: ['/discussion/topic-1']
  },
  decorators: [Story => withThread(Story)],
  beforeEach() {
    return mockThreadFetch(TOPIC, COMMENTS);
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByText('Thought of the day'), {
      timeout: 3000
    });
    await expect(canvas.getByText('Thought of the day')).toBeInTheDocument();
    await expect(canvas.getByText('swift-fox-12')).toBeInTheDocument();
    await expect(canvas.getByText('calm-owl-55')).toBeInTheDocument();
    await expect(canvas.getByText('Really resonates. Focused work beats scattered effort every time.')).toBeInTheDocument();
    // Avatar initials rendered
    await expect(canvas.getByText('SF')).toBeInTheDocument();
  }
}`,...(R=(M=T.parameters)==null?void 0:M.docs)==null?void 0:R.source},description:{story:"Full thread with nested reply",...(P=($=T.parameters)==null?void 0:$.docs)==null?void 0:P.description}}};var L,W,K,J,q;x.parameters={...x.parameters,docs:{...(L=x.parameters)==null?void 0:L.docs,source:{originalSource:`{
  parameters: {
    routerEntries: ['/discussion/topic-1']
  },
  decorators: [Story => withThread(Story)],
  beforeEach() {
    return mockThreadFetch(TOPIC, COMMENTS_WITH_DELETED);
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByText('[deleted]', {
      selector: 'p'
    }), {
      timeout: 3000
    });
    await expect(canvas.getByText('[deleted]', {
      selector: 'p'
    })).toBeInTheDocument();
  }
}`,...(K=(W=x.parameters)==null?void 0:W.docs)==null?void 0:K.source},description:{story:"Thread with a deleted comment renders [deleted] placeholder",...(q=(J=x.parameters)==null?void 0:J.docs)==null?void 0:q.description}}};var U,H,V,X,z;_.parameters={..._.parameters,docs:{...(U=_.parameters)==null?void 0:U.docs,source:{originalSource:`{
  parameters: {
    routerEntries: ['/discussion/topic-1']
  },
  decorators: [Story => withThread(Story)],
  beforeEach() {
    return mockThreadFetch({
      ...TOPIC,
      comment_count: 0
    }, []);
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByText(/No comments yet/), {
      timeout: 3000
    });
    await expect(canvas.getByText(/No comments yet/)).toBeInTheDocument();
  }
}`,...(V=(H=_.parameters)==null?void 0:H.docs)==null?void 0:V.source},description:{story:'Empty thread — shows "No comments yet" state',...(z=(X=_.parameters)==null?void 0:X.docs)==null?void 0:z.description}}};var G,Q,Y,Z,ee;w.parameters={...w.parameters,docs:{...(G=w.parameters)==null?void 0:G.docs,source:{originalSource:`{
  parameters: {
    routerEntries: ['/discussion/topic-1']
  },
  decorators: [Story => withThread(Story)],
  beforeEach() {
    const orig = globalThis.fetch;
    globalThis.fetch = async (url, ...args) => {
      if (String(url).includes('/api/discussion/topics/')) {
        return new Response(JSON.stringify({
          error: 'Not found'
        }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }
      return orig(url, ...args);
    };
    return () => {
      globalThis.fetch = orig;
    };
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByText(/Topic not found/), {
      timeout: 3000
    });
    await expect(canvas.getByText(/Topic not found/)).toBeInTheDocument();
  }
}`,...(Y=(Q=w.parameters)==null?void 0:Q.docs)==null?void 0:Y.source},description:{story:"404 — topic not found",...(ee=(Z=w.parameters)==null?void 0:Z.docs)==null?void 0:ee.description}}};const be=["WithComments","WithDeletedComment","EmptyThread","NotFound"];export{_ as EmptyThread,w as NotFound,T as WithComments,x as WithDeletedComment,be as __namedExportsOrder,ve as default};
