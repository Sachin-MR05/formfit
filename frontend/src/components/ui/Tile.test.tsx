import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotchButton } from './NotchButton';
import { ScoreRing } from './ScoreRing';
import { Tile } from './Tile';

describe('Tile', () => {
  it('renders its children on the tone background', () => {
    const { container } = render(<Tile tone="good">Hello tile</Tile>);
    expect(screen.getByText('Hello tile')).toBeInTheDocument();
    expect(container.querySelector('.bg-good')).not.toBeNull();
  });

  it('renders notch content outside the masked layer', () => {
    render(
      <Tile tone="body" notch={{ corner: 'top-right', content: <NotchButton label="Open" /> }}>
        Body
      </Tile>,
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
  });
});

describe('ScoreRing', () => {
  it('exposes the score and its band to assistive tech', () => {
    render(<ScoreRing score={87} />);
    expect(screen.getByRole('img', { name: /87 out of 100, Good form/ })).toBeInTheDocument();
  });

  it('clamps out-of-range scores', () => {
    render(<ScoreRing score={140} />);
    expect(screen.getByRole('img', { name: /100 out of 100/ })).toBeInTheDocument();
  });
});
