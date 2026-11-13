/*
  Luna film header: the only file you need to edit.

  1. Upload the film to Vimeo (the 4K master) and paste its link into `vimeo`, for example
     "https://vimeo.com/123456789", or for an unlisted video "https://vimeo.com/123456789/abc123def4".
     Vimeo plays it with its own play button and controls, in 4K in full screen.
  2. Until `vimeo` is set, the header plays `preview` on this computer (at localhost), so you can see
     the design. Online it shows a setup note instead; the preview film is never uploaded.
  3. The chapters match the 109-second UGC film (v22). For another cut, change the times (in seconds)
     and run tools/make-chapter-assets.sh for new thumbnails and a new voice line.
*/
window.LUNA_FILM_CONFIG = {
  vimeo: "",
  preview: "media/film/luna-ugc-109s-4k.mp4",
  aspect: "9:16", // until the player reports the film's real shape

  // Leave empty and Vimeo picks the sharpest stream the screen and connection can take (4K in
  // full screen on a big display). Paid Vimeo plans can force one: "4k", "2k", "1080p" or "720p".
  quality: "",

  brand: { name: "Luna", by: "by MergedX" },

  kicker: "Start with the film",
  // `keyword` sits on the accent block, the way keyword phrases do in the film.
  title: { lead: "Meet", keyword: "Luna." },
  subtitle: "Watch her catch the calls you can't take, book the job, and keep your team in the loop.",

  // The film's loudness and who speaks when. They drive the voice line beside the film.
  envelope: "media/film/envelope.js",
  voices: "media/film/voices.js",
  // The name shown while each speaker in voices.js is talking.
  speakers: { luna: "Luna", owner: "The owner", mark: "Mark, calling in", mike: "Mike, the technician" },

  // `at` is the second each chapter starts. Clicking a chapter jumps the player there.
  chapters: [
    { at: 0, title: "The calls you can't take", text: "On a job, you can't always answer, and missed calls mean lost customers.", thumb: "media/chapters/01.jpg" },
    { at: 6.57, title: "Luna steps in", text: "She catches the calls you'd miss, books jobs and assigns technicians.", thumb: "media/chapters/02.jpg" },
    { at: 15.03, title: "A real call, start to finish", text: "Mark's AC isn't cooling. Luna books him in for 2 PM.", thumb: "media/chapters/03.jpg" },
    { at: 48.03, title: "Booked and assigned", text: "Mark's booked and Mike's assigned, and nobody stepped away from a job.", thumb: "media/chapters/04.jpg" },
    { at: 53.33, title: "Today's schedule on WhatsApp", text: "\"Hey Luna, how's today's schedule looking?\"", thumb: "media/chapters/05.jpg" },
    { at: 69.93, title: "Technicians in the loop", text: "Mike gets his job details and updates things himself.", thumb: "media/chapters/06.jpg" },
    { at: 90.17, title: "The verdict", text: "Less time juggling calls, and more room for bookings.", thumb: "media/chapters/07.jpg" },
    { at: 100.97, title: "Luna, by MergedX", text: "The AI front office for home services.", thumb: "media/chapters/08.jpg" },
  ],

  end: {
    title: "That's Luna.",
    body: "Your setup path starts right below this film. Begin with Start here.",
    // Leave href empty to hide the button.
    cta: { label: "Open Start here", href: "" },
  },
};
