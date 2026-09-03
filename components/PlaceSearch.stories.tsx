import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import PlaceSearch from './PlaceSearch';
import { districtNames, dicts, searchPlaces } from '../.storybook/fixtures';

const strings = {
  label: dicts.tr.search.label,
  placeholder: dicts.tr.search.placeholder,
  empty: dicts.tr.search.empty,
  powerOn: dicts.tr.map.powerOn,
  powerOut: dicts.tr.map.powerOut,
};

const meta = {
  title: 'Components/PlaceSearch',
  component: PlaceSearch,
  args: { places: searchPlaces('tr'), locale: 'tr', districtNames, strings },
} satisfies Meta<typeof PlaceSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

// Typing populates the dropdown; play it in the Storybook UI by focusing the
// input and typing a village name such as "gön".
export const Focused: Story = {
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('combobox');
    await userEvent.click(input);
    await userEvent.type(input, 'gön');
  },
};
