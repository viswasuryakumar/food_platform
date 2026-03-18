import { useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import { useSelector } from "react-redux";

export default function OrderPage() {
  const { restaurantId } = useParams();
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState(1);
  const { token } = useSelector((state) => state.auth);

  function addItem() {
    setItems([...items, { name, price: parseFloat(price), quantity: qty }]);
    setName("");
    setPrice("");
    setQty(1);
  }

  async function placeOrder() {
    try {
      const res = await axios.post(
        "http://localhost:3000/api/orders",
        {
          restaurantId,
          items,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      alert("Order placed successfully!");

      // go to payment page instead of tracking
      window.location.href = `/payment/${res.data.order._id}`;
    } catch (err) {
      console.error("Order error", err);
      alert("Order failed");
    }
  }

  return (
    <div style={{ padding: "20px" }}>
      <h2>Create Order</h2>
      <p>Restaurant ID: {restaurantId}</p>

      <h3>Add Item</h3>
      <input
        placeholder="Item name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <br /><br />

      <input
        placeholder="Price"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <br /><br />

      <input
        type="number"
        placeholder="Quantity"
        value={qty}
        onChange={(e) => setQty(Number(e.target.value))}
      />
      <br /><br />

      <button onClick={addItem}>Add Item</button>

      <h3>Items Added:</h3>
      {items.map((it, index) => (
        <div key={index}>
          {it.name} - ${it.price} x {it.quantity}
        </div>
      ))}

      <br />
      <button onClick={placeOrder}>Place Order</button>
    </div>
  );
}