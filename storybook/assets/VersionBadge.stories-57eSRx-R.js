import{e as n}from"./index-IPsTsOz-.js";import{j}from"./iframe-BiyH-PPQ.js";import"./preload-helper-Dp1pzeXC.js";const w="0.8.54",E={version:w};function _({fontSize:t=10,color:e}){return j.jsxs("span",{className:"version-badge",style:{fontSize:t,...e?{color:e}:{}},children:["v",E.version]})}_.__docgenInfo={description:"",methods:[],displayName:"VersionBadge",props:{fontSize:{defaultValue:{value:"10",computed:!1},required:!1}}};const F={title:"UI/VersionBadge",component:_,tags:["autodocs"],parameters:{docs:{description:{component:"Static version display. Reads version from package.json."}}}},r={},s={args:{fontSize:16}},o={args:{color:"#6366f1"},parameters:{a11y:{disable:!0}}},a={play:async({canvasElement:t})=>{const e=t.querySelector(".version-badge");await n(e).not.toBeNull(),await n(e.textContent).toMatch(/v\d+\.\d+\.\d+/)}};var c,i,d,p,m;r.parameters={...r.parameters,docs:{...(c=r.parameters)==null?void 0:c.docs,source:{originalSource:"{}",...(d=(i=r.parameters)==null?void 0:i.docs)==null?void 0:d.source},description:{story:"Footer size (default 10px)",...(m=(p=r.parameters)==null?void 0:p.docs)==null?void 0:m.description}}};var l,u,g,f,y;s.parameters={...s.parameters,docs:{...(l=s.parameters)==null?void 0:l.docs,source:{originalSource:`{
  args: {
    fontSize: 16
  }
}`,...(g=(u=s.parameters)==null?void 0:u.docs)==null?void 0:g.source},description:{story:"Larger, for use in headings or dashboards",...(y=(f=s.parameters)==null?void 0:f.docs)==null?void 0:y.description}}};var v,S,x,b,h;o.parameters={...o.parameters,docs:{...(v=o.parameters)==null?void 0:v.docs,source:{originalSource:`{
  args: {
    color: '#6366f1'
  },
  parameters: {
    a11y: {
      disable: true
    }
  }
}`,...(x=(S=o.parameters)==null?void 0:S.docs)==null?void 0:x.source},description:{story:"Custom color — overrides theme token",...(h=(b=o.parameters)==null?void 0:b.docs)==null?void 0:h.description}}};var C,V,z,B,R;a.parameters={...a.parameters,docs:{...(C=a.parameters)==null?void 0:C.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const badge = canvasElement.querySelector('.version-badge');
    await expect(badge).not.toBeNull();
    await expect(badge.textContent).toMatch(/v\\d+\\.\\d+\\.\\d+/);
  }
}`,...(z=(V=a.parameters)==null?void 0:V.docs)==null?void 0:z.source},description:{story:"Renders the version string correctly",...(R=(B=a.parameters)==null?void 0:B.docs)==null?void 0:R.description}}};const L=["FooterSize","Large","CustomColor","RendersVersion"];export{o as CustomColor,r as FooterSize,s as Large,a as RendersVersion,L as __namedExportsOrder,F as default};
