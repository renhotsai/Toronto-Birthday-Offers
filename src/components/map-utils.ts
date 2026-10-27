// Kept separate from MapView so importing these never pulls Leaflet into a server render.
export type MapPoint = {
  id: number;
  lat: number;
  lng: number;
  icon: string;
  // Trusted HTML built by the caller from escaped values.
  popupHtml: string;
};

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
