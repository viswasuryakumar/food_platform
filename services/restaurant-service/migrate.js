require("dotenv").config();
const mongoose = require("mongoose");
const Restaurant = require("./models/Restaurant");
const MenuItem = require("./models/MenuItem");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to DB");
  
  const restaurants = await Restaurant.find({});
  for (const r of restaurants) {
    if (r.name) {
      r.name_normalized = r.name.toLowerCase().trim();
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
