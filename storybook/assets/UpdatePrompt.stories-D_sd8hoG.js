import{e as i}from"./index-IPsTsOz-.js";import{r as m,j as s}from"./iframe-CBjfzDqo.js";import"./preload-helper-Dp1pzeXC.js";function l(){const[e,t]=m.useState(!1);return{needRefresh:[e,t],updateServiceWorker:()=>{}}}function c(){const{needRefresh:[e],updateServiceWorker:t}=l();return e?s.jsxs("div",{id:"update-prompt",className:"update-prompt",children:[s.jsx("span",{className:"update-prompt__message",children:"new version available"}),s.jsx("button",{className:"update-prompt__reload",onClick:()=>t(!0),children:"reload"})]}):null}c.__docgenInfo={description:"",methods:[],displayName:"UpdatePrompt"};const y={title:"UI/UpdatePrompt",component:c,tags:["autodocs"],parameters:{docs:{description:{component:"PWA update banner. Appears when a new service worker version is waiting. Hidden by default — only shows when needRefresh=true."}}}},r={play:async({canvasElement:e})=>{const t=e.querySelector("#update-prompt");await i(t).toBeNull()}};var o,a,n,p,d;r.parameters={...r.parameters,docs:{...(o=r.parameters)==null?void 0:o.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const prompt = canvasElement.querySelector('#update-prompt');
    await expect(prompt).toBeNull();
  }
}`,...(n=(a=r.parameters)==null?void 0:a.docs)==null?void 0:n.source},description:{story:"Hidden by default (needRefresh=false from the mock)",...(d=(p=r.parameters)==null?void 0:p.docs)==null?void 0:d.description}}};const x=["Hidden"];export{r as Hidden,x as __namedExportsOrder,y as default};
