require("dotenv").config();
const mongoose = require("mongoose");
const Restaurant = require("./models/Restaurant");
const MenuItem = require("./models/MenuItem");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to DB");
  
  const restaurants = await Restaurant.find({});
  for (const r of restaurants) {
    let modified = false;
    if (r.name) {
      const newNameNorm = r.name.toLowerCase().trim();
      if (r.name_normalized !== newNameNorm) {
        r.name_normalized = newNameNorm;
        modified = true;
      }
    }
    if (r.cuisine) {
      const newCuisineNorm = r.cuisine.toLowerCase().trim();
      if (r.cuisine_normalized !== newCuisineNorm) {
        r.cuisine_normalized = newCuisineNorm;
        modified = true;
      }
    } else {
      if (r.cuisine_normalized !== "") {
        r.cuisine_normalized = "";
        modified = true;
      }
    }
    if (modified) {
      await r.save();
    }
  }
  console.log("Migrated restaurants");

  const menuItems = await MenuItem.find({});
  for (const m of menuItems) {
    if (m.name) {
      m.name_normalized = m.name.toLowerCase().trim();
      await m.save();
    }
  }
  console.log("Migrated menu items");
  
  process.exit(0);
}
run().catch(err => {
  console.error(err);
  process.exit(1);
});
