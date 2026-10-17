export const apps = [
  { id: "documents", name: "Documents", category: "Office", description: "Browser-based document editing.", url: "https://documents.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/documents", mode: "browser", hosted: true },
  { id: "spreadsheet", name: "Spreadsheet", category: "Office", description: "Work with spreadsheets in the browser.", url: "https://spreadsheet.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/spreadsheet", mode: "browser", hosted: true },
  { id: "presentation", name: "Presentation", category: "Office", description: "Create browser-based presentations.", url: "https://presentation.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/presentation", mode: "browser", hosted: true },
  { id: "pdf", name: "PDF", category: "Office", description: "Source repository for PDF tools; a hosted endpoint has not been verified.", url: "https://github.com/HeyPuter/everything/tree/main/src/pdf", source: "https://github.com/HeyPuter/everything/tree/main/src/pdf", mode: "source", hosted: false },
  { id: "photo-studio", name: "Photo Studio", category: "Creative", description: "Image editing in the browser.", url: "https://ps.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/photo-studio", mode: "browser", hosted: true },
  { id: "video-studio", name: "Video Studio", category: "Creative", description: "Browser-based video editing tools.", url: "https://vs.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/video-studio", mode: "browser", hosted: true },
  { id: "audio-studio", name: "Audio Studio", category: "Creative", description: "Source repository for browser audio tools; hosted endpoint not verified.", url: "https://github.com/HeyPuter/everything/tree/main/src/audio-studio", source: "https://github.com/HeyPuter/everything/tree/main/src/audio-studio", mode: "source", hosted: false },
  { id: "music-studio", name: "Music Studio", category: "Creative", description: "Browser-based music production tools.", url: "https://ms.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/music-studio", mode: "browser", hosted: true },
  { id: "3d-studio", name: "3D Studio", category: "Creative", description: "Explore 3D creation in the browser.", url: "https://3d.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/3d", mode: "browser", hosted: true },
  { id: "cad", name: "CAD", category: "Engineering", description: "Source repository for CAD tools; hosted endpoint not verified.", url: "https://github.com/HeyPuter/everything/tree/main/src/cad", source: "https://github.com/HeyPuter/everything/tree/main/src/cad", mode: "source", hosted: false },
  { id: "meetings", name: "Meetings", category: "Collaboration", description: "Browser-based meetings.", url: "https://meetings.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/meetings", mode: "browser", hosted: true },
  { id: "teamchat", name: "Teamchat", category: "Collaboration", description: "Team messaging in the browser.", url: "https://teamchat.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/teamchat", mode: "browser", hosted: true },
  { id: "calendar", name: "Calendar", category: "Productivity", description: "Browser-based calendar.", url: "https://calendar.puter.com/", source: "https://github.com/HeyPuter/everything/tree/main/src/calendar", mode: "browser", hosted: true },
  { id: "accounting", name: "Accounting", category: "Business", description: "Source repository for accounting tools; hosted endpoint not verified.", url: "https://github.com/HeyPuter/everything/tree/main/src/accounting", source: "https://github.com/HeyPuter/everything/tree/main/src/accounting", mode: "source", hosted: false },
  { id: "crm", name: "CRM", category: "Business", description: "Source repository for customer relationship management tools; hosted endpoint not verified.", url: "https://github.com/HeyPuter/everything/tree/main/src/crm", source: "https://github.com/HeyPuter/everything/tree/main/src/crm", mode: "source", hosted: false },
  { id: "inventory", name: "Inventory", category: "Business", description: "Source repository for inventory tools; hosted endpoint not verified.", url: "https://github.com/HeyPuter/everything/tree/main/src/inventory", source: "https://github.com/HeyPuter/everything/tree/main/src/inventory", mode: "source", hosted: false },
  { id: "api-client", name: "API Client", category: "Developer", description: "Source repository for API tooling; hosted endpoint not verified.", url: "https://github.com/HeyPuter/everything/tree/main/src/api-client", source: "https://github.com/HeyPuter/everything/tree/main/src/api-client", mode: "source", hosted: false }
];

export function getApps({ query = "", category = "All" } = {}) {
  const q = query.trim().toLowerCase();
  return apps.filter((app) => {
    const matchesCategory = category === "All" || app.category === category;
    const matchesQuery = !q || [app.name, app.category, app.description].some((value) => value.toLowerCase().includes(q));
    return matchesCategory && matchesQuery;
  });
}
