import{w as b,e as u,u as p}from"./index-ChtyZVKZ.js";import{r as y,j as o}from"./iframe-DUOvj927.js";import"./preload-helper-Dp1pzeXC.js";async function I(t,a){const e=await fetch("/api/feedback",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:t.trim(),page:a})});if(!e.ok){const s=await e.json().catch(()=>({}));throw new Error(s.error||"Failed to submit")}}function K({onDone:t,autoFocus:a=!1}){const[e,s]=y.useState(""),[i,c]=y.useState("idle"),[L,D]=y.useState("");async function h(n){if(n==null||n.preventDefault(),!(!e.trim()||i==="sending")){c("sending");try{await I(e,window.location.pathname),s(""),c("done"),setTimeout(()=>{c("idle"),t==null||t()},2200)}catch(H){D(H.message),c("error"),setTimeout(()=>c("idle"),3e3)}}}if(i==="done")return o.jsx("div",{className:"feedback-form__done",children:o.jsx("div",{className:"feedback-form__done-text",children:"✓ sent · thank you"})});const f=e.trim()&&i!=="sending";return o.jsxs("form",{onSubmit:h,children:[o.jsx("textarea",{className:"feedback-form__textarea",value:e,onChange:n=>s(n.target.value),onKeyDown:n=>{(n.metaKey||n.ctrlKey)&&n.key==="Enter"&&h()},placeholder:"What's on your mind? (anonymous)",rows:3,maxLength:1e3,autoFocus:a}),o.jsxs("div",{className:"feedback-form__footer",children:[i==="error"?o.jsx("span",{className:"feedback-form__hint feedback-form__hint--error",children:L}):o.jsx("span",{className:"feedback-form__hint",children:"⌘↵ or Ctrl↵ to send"}),o.jsx("button",{type:"submit",disabled:!f,className:`feedback-form__submit${f?" feedback-form__submit--active":" feedback-form__submit--idle"}`,children:i==="sending"?"…":"Send →"})]})]})}K.__docgenInfo={description:"",methods:[],displayName:"FeedbackForm",props:{autoFocus:{defaultValue:{value:"false",computed:!1},required:!1}}};const M={title:"Feedback/FeedbackForm",component:K,tags:["autodocs"],parameters:{docs:{description:{component:"Inline feedback textarea + send button. Submit is disabled until there is non-whitespace input."}}}},r={play:async({canvasElement:t})=>{const e=b(t).getByRole("button",{name:/send/i});await u(e).toBeDisabled()}},d={play:async({canvasElement:t})=>{const a=b(t),e=a.getByRole("textbox"),s=a.getByRole("button",{name:/send/i});await p.type(e,"Great site!"),await u(e).toHaveValue("Great site!"),await u(s).toBeEnabled()}},m={play:async({canvasElement:t})=>{const a=b(t),e=a.getByRole("textbox"),s=a.getByRole("button",{name:/send/i});await p.type(e,"   "),await u(s).toBeDisabled()}},l={play:async({canvasElement:t})=>{const a=globalThis.fetch;globalThis.fetch=()=>Promise.resolve(new Response("{}",{status:200}));const e=b(t),s=e.getByRole("textbox"),i=e.getByRole("button",{name:/send/i});await p.type(s,"Love this portfolio!"),await p.click(i),await u(e.getByText(/sent · thank you/i)).toBeVisible(),globalThis.fetch=a}};var x,v,g,w,k;r.parameters={...r.parameters,docs:{...(x=r.parameters)==null?void 0:x.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const submit = canvas.getByRole('button', {
      name: /send/i
    });
    await expect(submit).toBeDisabled();
  }
}`,...(g=(v=r.parameters)==null?void 0:v.docs)==null?void 0:g.source},description:{story:"Empty state — submit is disabled",...(k=(w=r.parameters)==null?void 0:w.docs)==null?void 0:k.description}}};var _,B,E,S,R;d.parameters={...d.parameters,docs:{...(_=d.parameters)==null?void 0:_.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole('textbox');
    const submit = canvas.getByRole('button', {
      name: /send/i
    });
    await userEvent.type(textarea, 'Great site!');
    await expect(textarea).toHaveValue('Great site!');
    await expect(submit).toBeEnabled();
  }
}`,...(E=(B=d.parameters)==null?void 0:B.docs)==null?void 0:E.source},description:{story:"Typing text enables the submit button",...(R=(S=d.parameters)==null?void 0:S.docs)==null?void 0:R.description}}};var T,F,j,N,V;m.parameters={...m.parameters,docs:{...(T=m.parameters)==null?void 0:T.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole('textbox');
    const submit = canvas.getByRole('button', {
      name: /send/i
    });
    await userEvent.type(textarea, '   ');
    await expect(submit).toBeDisabled();
  }
}`,...(j=(F=m.parameters)==null?void 0:F.docs)==null?void 0:j.source},description:{story:"Whitespace-only input keeps submit disabled",...(V=(N=m.parameters)==null?void 0:N.docs)==null?void 0:V.description}}};var W,O,G,P,C;l.parameters={...l.parameters,docs:{...(W=l.parameters)==null?void 0:W.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    // Swap fetch directly — works in both Vitest and static deployed Storybook
    const origFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response('{}', {
      status: 200
    }));
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole('textbox');
    const submit = canvas.getByRole('button', {
      name: /send/i
    });
    await userEvent.type(textarea, 'Love this portfolio!');
    await userEvent.click(submit);

    // After success the done message appears
    await expect(canvas.getByText(/sent · thank you/i)).toBeVisible();
    globalThis.fetch = origFetch;
  }
}`,...(G=(O=l.parameters)==null?void 0:O.docs)==null?void 0:G.source},description:{story:"Successful submission shows the done state",...(C=(P=l.parameters)==null?void 0:P.docs)==null?void 0:C.description}}};const $=["Empty","WithText","WhitespaceOnly","SubmitSuccess"];export{r as Empty,l as SubmitSuccess,m as WhitespaceOnly,d as WithText,$ as __namedExportsOrder,M as default};
