import { expect } from '@storybook/test';
import VersionBadge from '../components/VersionBadge';

export default {
  title: 'UI/VersionBadge',
  component: VersionBadge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Static version display. Reads version from package.json.',
      },
    },
  },
};

/** Footer size (default 10px) */
export const FooterSize = {};

/** Larger, for use in headings or dashboards */
export const Large = {
  args: { fontSize: 16 },
};

/** Custom color — overrides theme token */
export const CustomColor = {
  args: { color: '#6366f1' },
  parameters: {
    a11y: { disable: true },
  },
};

/** Renders the version string correctly */
export const RendersVersion = {
  play: async ({ canvasElement }) => {
    const badge = canvasElement.querySelector('.version-badge');
    await expect(badge).not.toBeNull();
    await expect(badge.textContent).toMatch(/v\d+\.\d+\.\d+/);
  },
};
