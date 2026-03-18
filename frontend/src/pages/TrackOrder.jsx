import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { useSelector } from "react-redux";

export default function TrackOrder() {
  const { orderId } = useParams();
  const [status, setStatus] = useState("pending");
  const { token } = useSelector((state) => state.auth);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await axios.get(`http://localhost:3000/api/orders/${orderId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setStatus(res.data.status);
      } catch (err) {
        console.error("Failed to fetch order", err);
      }
    };

    if (token) {
      fetchOrder();
    }
  }, [orderId, token]);

  useEffect(() => {
    debugger;
    const socket = new WebSocket("ws://localhost:3005");

    socket.onopen = () => {
      console.log("Connected to WebSocket");
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.orderId === orderId) {
        setStatus(data.status);
      }
    };

    socket.onclose = () => {
      console.log("WebSocket disconnected");
    };

    return () => socket.close();
  }, [orderId]);

  return (
    <div style={{ padding: "20px" }}>
      <h2>Order Tracking</h2>
      <h3>Order ID: {orderId}</h3>
      <h3>Status: {status}</h3>
    </div>
  );
}
