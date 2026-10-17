export const apps = [
  { id: "documents", name: "Documents", category: "Office", description: "Browser-based document editing.", url: "https://documents.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/documents", mode: "browser", status: "external" },
  { id: "spreadsheet", name: "Spreadsheet", category: "Office", description: "Work with spreadsheets in the browser.", url: "https://spreadsheet.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/spreadsheet", mode: "browser", status: "external" },
  { id: "presentation", name: "Presentation", category: "Office", description: "Create browser-based presentations.", url: "https://presentation.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/presentation", mode: "browser", status: "external" },
  { id: "pdf", name: "PDF", category: "Office", description: "Browser-based PDF tools.", url: "https://pdf.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/pdf", mode: "browser", status: "external" },
  { id: "photo-studio", name: "Photo Studio", category: "Creative", description: "Image editing in the browser.", url: "https://ps.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/photo-studio", mode: "browser", status: "external" },
  { id: "video-studio", name: "Video Studio", category: "Creative", description: "Browser-based video editing tools.", url: "https://vs.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/video-studio", mode: "browser", status: "external" },
  { id: "audio-studio", name: "Audio Studio", category: "Creative", description: "Audio editing in the browser.", url: "https://as.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/audio-studio", mode: "browser", status: "external" },
  { id: "music-studio", name: "Music Studio", category: "Creative", description: "Browser-based music production tools.", url: "https://ms.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/music-studio", mode: "browser", status: "external" },
  { id: "3d-studio", name: "3D Studio", category: "Creative", description: "Explore 3D creation in the browser.", url: "https://3d.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/3d", mode: "browser", status: "external" },
  { id: "cad", name: "CAD", category: "Engineering", description: "Browser-based computer-aided design.", url: "https://cad.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/cad", mode: "browser", status: "external" },
  { id: "meetings", name: "Meetings", category: "Collaboration", description: "Browser-based meetings.", url: "https://meetings.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/meetings", mode: "browser", status: "external" },
  { id: "teamchat", name: "Teamchat", category: "Collaboration", description: "Team messaging in the browser.", url: "https://teamchat.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/teamchat", mode: "browser", status: "external" },
  { id: "calendar", name: "Calendar", category: "Productivity", description: "Browser-based calendar.", url: "https://calendar.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/calendar", mode: "browser", status: "external" },
  { id: "accounting", name: "Accounting", category: "Business", description: "Browser-based accounting tools.", url: "https://accounting.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/accounting", mode: "browser", status: "external" },
  { id: "crm", name: "CRM", category: "Business", description: "Customer relationship management in the browser.", url: "https://crm.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/crm", mode: "browser", status: "external" },
  { id: "inventory", name: "Inventory", category: "Business", description: "Browser-based inventory management.", url: "https://inventory.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/inventory", mode: "browser", status: "external" },
  { id: "api-client", name: "API Client", category: "Developer", description: "Tools for working with APIs.", url: "https://apic.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/api-client", mode: "browser", status: "external" }
];

export function getApps({ query = "", category = "All" } = {}) {
  const q = query.trim().toLowerCase();
  return apps.filter((app) => {
    const matchesCategory = category === "All" || app.category === category;
    const matchesQuery = !q || [app.name, app.category, app.description].some((value) => value.toLowerCase().includes(q));
    return matchesCategory && matchesQuery;
  });
}
