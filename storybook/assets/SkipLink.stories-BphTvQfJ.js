import{w as c,e as p}from"./index-IPsTsOz-.js";import{S as l}from"./UI-CnFkN7yf.js";import"./iframe-C92zRC5s.js";import"./preload-helper-Dp1pzeXC.js";const f={title:"UI/SkipLink",component:l,tags:["autodocs"],parameters:{docs:{description:{component:"Keyboard-only skip link. Visually hidden until focused — allows keyboard users to jump past navigation to main content."}}}},t={play:async({canvasElement:i})=>{const r=c(i).getByRole("link",{name:/skip to content/i});await p(r).toHaveAttribute("href","#main")}};var n,e,a,o,s;t.parameters={...t.parameters,docs:{...(n=t.parameters)==null?void 0:n.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link', {
      name: /skip to content/i
    });
    await expect(link).toHaveAttribute('href', '#main');
  }
}`,...(a=(e=t.parameters)==null?void 0:e.docs)==null?void 0:a.source},description:{story:"Default — renders with correct href",...(s=(o=t.parameters)==null?void 0:o.docs)==null?void 0:s.description}}};const v=["Default"];export{t as Default,v as __namedExportsOrder,f as default};
