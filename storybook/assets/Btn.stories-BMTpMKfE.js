import{j as s}from"./iframe-C_YnIq06.js";import{w as _,e as i}from"./index-IPsTsOz-.js";import{B as n}from"./UI-DQwpLNM3.js";import"./preload-helper-Dp1pzeXC.js";const L={title:"UI/Btn",component:n,tags:["autodocs"],parameters:{docs:{description:{component:"Link-styled button with primary and ghost variants."}}},args:{href:"#",children:"View project"}},r={},e={args:{primary:!0,children:"Get started"}},t={args:{primary:!0,external:!0,href:"https://example.com",children:"GitHub →"},play:async({canvasElement:P})=>{const o=_(P).getByRole("link");await i(o).toHaveAttribute("target","_blank"),await i(o).toHaveAttribute("rel","noopener noreferrer")}},a={render:()=>s.jsxs("div",{style:{display:"flex",gap:12},children:[s.jsx(n,{href:"#",children:"Ghost"}),s.jsx(n,{href:"#",primary:!0,children:"Primary"})]})};var c,p,d,m,l;r.parameters={...r.parameters,docs:{...(c=r.parameters)==null?void 0:c.docs,source:{originalSource:"{}",...(d=(p=r.parameters)==null?void 0:p.docs)==null?void 0:d.source},description:{story:"Ghost variant (default)",...(l=(m=r.parameters)==null?void 0:m.docs)==null?void 0:l.description}}};var u,h,y,x,g;e.parameters={...e.parameters,docs:{...(u=e.parameters)==null?void 0:u.docs,source:{originalSource:`{
  args: {
    primary: true,
    children: 'Get started'
  }
}`,...(y=(h=e.parameters)==null?void 0:h.docs)==null?void 0:y.source},description:{story:"Primary variant with filled accent background",...(g=(x=e.parameters)==null?void 0:x.docs)==null?void 0:g.description}}};var f,v,B,b,k;t.parameters={...t.parameters,docs:{...(f=t.parameters)==null?void 0:f.docs,source:{originalSource:`{
  args: {
    primary: true,
    external: true,
    href: 'https://example.com',
    children: 'GitHub →'
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole('link');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
}`,...(B=(v=t.parameters)==null?void 0:v.docs)==null?void 0:B.source},description:{story:"External link opens in a new tab",...(k=(b=t.parameters)==null?void 0:b.docs)==null?void 0:k.description}}};var w,G,E,j,H;a.parameters={...a.parameters,docs:{...(w=a.parameters)==null?void 0:w.docs,source:{originalSource:`{
  render: () => <div style={{
    display: 'flex',
    gap: 12
  }}>
      <Btn href="#">Ghost</Btn>
      <Btn href="#" primary>Primary</Btn>
    </div>
}`,...(E=(G=a.parameters)==null?void 0:G.docs)==null?void 0:E.source},description:{story:"Both variants side by side",...(H=(j=a.parameters)==null?void 0:j.docs)==null?void 0:H.description}}};const O=["Ghost","Primary","External","BothVariants"];export{a as BothVariants,t as External,r as Ghost,e as Primary,O as __namedExportsOrder,L as default};
