import{w as p,u as c,e}from"./index-IPsTsOz-.js";import{T as S}from"./UI-5HelFhTf.js";import"./iframe-CoUcrgS5.js";import"./preload-helper-Dp1pzeXC.js";const O={title:"UI/ThemeToggle",component:S,tags:["autodocs"],parameters:{docs:{description:{component:"3-segment theme control (Auto / Light / Dark). Uses aria-pressed for accessibility."}}}},r={},n={play:async({canvasElement:s})=>{const t=p(s),a=t.getByRole("button",{name:"Light"});await c.click(a),await e(a).toHaveAttribute("aria-pressed","true"),await e(t.getByRole("button",{name:"Auto"})).toHaveAttribute("aria-pressed","false"),await e(t.getByRole("button",{name:"Dark"})).toHaveAttribute("aria-pressed","false")}},o={play:async({canvasElement:s})=>{const t=p(s),a=t.getByRole("button",{name:"Dark"});await c.click(a),await e(a).toHaveAttribute("aria-pressed","true"),await e(t.getByRole("button",{name:"Light"})).toHaveAttribute("aria-pressed","false")}},i={play:async({canvasElement:s})=>{const t=p(s),a=t.getByRole("button",{name:"Auto"}),l=t.getByRole("button",{name:"Light"}),u=t.getByRole("button",{name:"Dark"});await c.click(l),await e(l).toHaveAttribute("aria-pressed","true"),await c.click(u),await e(u).toHaveAttribute("aria-pressed","true"),await e(l).toHaveAttribute("aria-pressed","false"),await c.click(a),await e(a).toHaveAttribute("aria-pressed","true"),await e(u).toHaveAttribute("aria-pressed","false")}};var d,m,g,v,b;r.parameters={...r.parameters,docs:{...(d=r.parameters)==null?void 0:d.docs,source:{originalSource:"{}",...(g=(m=r.parameters)==null?void 0:m.docs)==null?void 0:g.source},description:{story:"Default — auto is selected on first render",...(b=(v=r.parameters)==null?void 0:v.docs)==null?void 0:b.description}}};var k,y,w,h,A;n.parameters={...n.parameters,docs:{...(k=n.parameters)==null?void 0:k.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const lightBtn = canvas.getByRole('button', {
      name: 'Light'
    });
    await userEvent.click(lightBtn);
    await expect(lightBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', {
      name: 'Auto'
    })).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas.getByRole('button', {
      name: 'Dark'
    })).toHaveAttribute('aria-pressed', 'false');
  }
}`,...(w=(y=n.parameters)==null?void 0:y.docs)==null?void 0:w.source},description:{story:"Clicking Light sets aria-pressed=true on the Light button",...(A=(h=n.parameters)==null?void 0:h.docs)==null?void 0:A.description}}};var B,H,f,R,D;o.parameters={...o.parameters,docs:{...(B=o.parameters)==null?void 0:B.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const darkBtn = canvas.getByRole('button', {
      name: 'Dark'
    });
    await userEvent.click(darkBtn);
    await expect(darkBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', {
      name: 'Light'
    })).toHaveAttribute('aria-pressed', 'false');
  }
}`,...(f=(H=o.parameters)==null?void 0:H.docs)==null?void 0:f.source},description:{story:"Clicking Dark sets aria-pressed=true on the Dark button",...(D=(R=o.parameters)==null?void 0:R.docs)==null?void 0:D.description}}};var x,E,L,C,T;i.parameters={...i.parameters,docs:{...(x=i.parameters)==null?void 0:x.docs,source:{originalSource:`{
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const auto = canvas.getByRole('button', {
      name: 'Auto'
    });
    const light = canvas.getByRole('button', {
      name: 'Light'
    });
    const dark = canvas.getByRole('button', {
      name: 'Dark'
    });
    await userEvent.click(light);
    await expect(light).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(dark);
    await expect(dark).toHaveAttribute('aria-pressed', 'true');
    await expect(light).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(auto);
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
    await expect(dark).toHaveAttribute('aria-pressed', 'false');
  }
}`,...(L=(E=i.parameters)==null?void 0:E.docs)==null?void 0:L.source},description:{story:"Cycling through all three modes",...(T=(C=i.parameters)==null?void 0:C.docs)==null?void 0:T.description}}};const j=["Default","ClickLight","ClickDark","CycleAllModes"];export{o as ClickDark,n as ClickLight,i as CycleAllModes,r as Default,j as __namedExportsOrder,O as default};
