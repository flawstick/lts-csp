import { db } from "./index";
import { organisations, jurisdictions, orgSettings } from "./schema";

async function seed() {
  console.log("Seeding database...");

  // Create LTS organisation
  const [lts] = await db
    .insert(organisations)
    .values({
      name: "LTS",
      slug: "lts",
      logoUrl: null,
    })
    .onConflictDoNothing()
    .returning();

  if (lts) {
    console.log("Created organisation:", lts.name);

    // Create org settings
    await db
      .insert(orgSettings)
      .values({
        orgId: lts.id,
        defaultAiModel: "claude-3-5-sonnet",
        settings: {},
      })
      .onConflictDoNothing();
    console.log("Created org settings for LTS");
  } else {
    console.log("LTS organisation already exists");
  }

  // Create jurisdictions
  const jurisdictionData = [
    {
      code: "GG",
      name: "Guernsey",
      country: "Channel Islands",
      portalUrl: "https://eforms.gov.gg",
    },
    {
      code: "JE",
      name: "Jersey",
      country: "Channel Islands",
      portalUrl: "https://www.gov.je",
    },
    {
      code: "IM",
      name: "Isle of Man",
      country: "British Crown Dependency",
      portalUrl: "https://www.gov.im",
    },
  ];

  for (const j of jurisdictionData) {
    const [created] = await db
      .insert(jurisdictions)
      .values(j)
      .onConflictDoNothing()
      .returning();

    if (created) {
      console.log("Created jurisdiction:", created.name);
    }
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
