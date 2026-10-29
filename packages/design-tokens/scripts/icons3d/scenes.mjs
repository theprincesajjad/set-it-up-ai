/** Spot illustrations (160 x 120): one scene each, at most four objects, same light and tones as the objects. */
import { A, N, WHITE, INK } from "./engine.mjs";
import { objects } from "./objects.mjs";

/** Screen-right and toward-camera offsets to world x / y (the camera is yawed 24 degrees). */
const P = (sx, near, extra = {}) => ({ x: sx * 0.9135 + near * 0.4067, y: sx * 0.4067 - near * 0.9135, ...extra });

const house = (L) => {
  L.shadow(0, 0, 13, 4.4);
  L.box(-9, -6, 0, 18, 12, 10, N, 1.2);
  L.poly3([[0, -6.4, 17], [0, 6.4, 17], [-10, 6.4, 10], [-10, -6.4, 10]], A.lit, 0.4);
  L.poly3([[0, -6.4, 17], [0, 6.4, 17], [10, 6.4, 10], [10, -6.4, 10]], A.mid, 0.4);
  L.poly3([[-9, -6.01, 10], [9, -6.01, 10], [0, -6.01, 16.6]], N.mid, 0.2);
  L.poly3([[-1.8, -6.05, 0], [2.4, -6.05, 0], [2.4, -6.05, 6.4], [-1.8, -6.05, 6.4]], INK.lit, 0.6);
  L.poly3([[-7.4, -6.05, 3], [-4, -6.05, 3], [-4, -6.05, 6.4], [-7.4, -6.05, 6.4]], N.lit, 0.5);
  L.poly3([[4.2, -6.05, 3], [7.6, -6.05, 3], [7.6, -6.05, 6.4], [4.2, -6.05, 6.4]], N.lit, 0.5);
};

export const scenes = {
  live: (L) => {
    objects.link(L.sub(P(-25, -7, { k: 0.95 })));
    objects.phone_message(L.sub(P(-1, 0, { k: 1.05 })));
    objects.check_done(L.sub(P(24, 8, { k: 0.85 })));
  },
  first_booking: (L) => {
    objects.calendar_week(L.sub(P(-6, -5, { k: 1.1 })));
    objects.bell(L.sub(P(19, 9, { k: 1 })));
  },
  regulars: (L) => {
    objects.megaphone(L.sub(P(27, -2, { k: 0.85 })));
    objects.pass(L.sub(P(-14, -1, { rot: 24, k: 0.85 })));
    objects.pass(L.sub(P(-3, -2, { rot: 0, k: 0.85 })));
    objects.pass(L.sub(P(6, 5, { rot: -24, k: 0.85 })));
  },
  home_studio: (L) => {
    house(L.sub(P(15, -5, { k: 0.9 })));
    objects.pin_area(L.sub(P(-14, 6, { k: 0.95 })));
  },
  site_ready: (L) => {
    objects.site(L.sub(P(-7, -6, { k: 1.1 })));
    objects.domain(L.sub(P(21, 8, { k: 0.85 })));
  },
  inbox_quiet: (L) => {
    objects.instagram_mark(L.sub(P(15, -6, { k: 0.9 })));
    objects.inbox(L.sub(P(-11, 3, { k: 1.05 })), { empty: true });
  },
  chairs: (L) => {
    objects.barber(L.sub(P(-19, -4, { k: 1 })), { accent: false });
    objects.barber(L.sub(P(0, 0, { k: 1 })), { accent: true });
    objects.barber(L.sub(P(19, 4, { k: 1 })), { accent: false });
  },
};
