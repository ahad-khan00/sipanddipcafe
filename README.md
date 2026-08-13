# QuickTable Order

Build a production-quality multi-tenant cafe QR ordering web application.

Product concept

Customers scan a QR code placed on a cafe table/bench. The QR code identifies the table automatically. The customer sees the cafe's menu, adds food items to a cart, and places an order without creating an account.

The cafe owner has a secure admin dashboard where they can manage menu items, tables, and incoming orders in real time.

Use Supabase for authentication, PostgreSQL database, realtime functionality, and Row Level Security.

Customer flow

Customer scans a table QR code.

Open the cafe menu URL with a secure random table token.

Resolve the token to the correct cafe and table.

Display the cafe name and table number.

Customer browses menu categories.

Customer can view food images, descriptions and prices.

Customer adds items to cart.

Customer changes quantities or removes items.

Customer optionally enters their name and phone number.

Customer reviews the order.

Customer places the order.

Backend validates all menu items, availability, quantities and prices.

Backend calculates the total from database prices. Never trust prices or totals sent by the client.

Create the order and order_items records atomically.

Show the customer an order confirmation page with order number, table number and current order status.

Customer can see real-time order status changes.

Do NOT require customers to create an account for ordering.

Owner/admin dashboard

Create a secure owner dashboard with:

Login

Overview

New orders

Preparing orders

Ready orders

Completed orders

Menu management

Table management

Cafe settings

Order statuses:

NEW
ACCEPTED
PREPARING
READY
COMPLETED
CANCELLED

The owner should receive a realtime notification when a new order arrives.

The owner should be able to:

Accept an order

Start preparing

Mark it ready

Complete the order

Cancel an order

View order details

View table number

View customer name if provided

View special instructions if provided

Menu management

Owner can:

Add food item

Edit food item

Delete/deactivate food item

Upload image

Set category

Set price

Set description

Mark item available/unavailable

Unavailable items must not be orderable.

Tables

Create a tables system.

Each table has:

id

cafe_id

table_number

secure random QR token

active status

Generate QR codes for tables.

The QR URL should contain the random table token rather than relying only on a predictable table number.

When a customer scans the QR code, automatically identify the table. Do not require the customer to manually select a table.

Display the identified table number prominently so the customer can verify it.

Database

Create properly normalized PostgreSQL tables for:

cafes

cafe_members / owners

tables

menu_categories

menu_items

orders

order_items

Use foreign keys and appropriate indexes.

Store the actual item price in order_items at the time the order is created so historical orders do not change when menu prices change.

Security requirements

Security is a priority.

Implement Supabase Row Level Security on all relevant tables.

Cafe owners must only be able to access data belonging to cafes they are authorized to manage.

Customers must not be able to access other customers' private order information.

Never expose the Supabase service-role key or other secret credentials in frontend code.

Never trust client-provided:

prices

totals

cafe IDs

order status

ownership information

Validate these server-side.

Calculate order totals server-side using current database menu prices.

Validate:

menu item IDs

quantities

availability

table token

cafe ownership

request data

Prevent users from modifying another cafe's data through manipulated IDs.

Use secure random tokens for table QR codes.

Add reasonable protection against spam/automated order creation and excessive requests.

Do not expose unnecessary customer personal information.

Architecture

Keep customer-facing pages separate from authenticated owner/admin pages.

Suggested routes:

/menu
/cart
/order/:id
/admin/login
/admin
/admin/orders
/admin/menu
/admin/tables
/admin/settings

Use Supabase Realtime for new orders and order status changes.

UI/UX

Create a clean modern cafe interface.

Mobile-first design because customers will access it by scanning QR codes on their phones.

Customer UI should be extremely simple:

QR scan → Menu → Cart → Confirm → Order tracking.

Use large food images, clear prices, category navigation and an obvious Add button.

Owner dashboard should be optimized for both desktop and mobile.

Use clear order status badges and prominent action buttons.

Important implementation rule

Do not fake backend functionality with localStorage or mock data.

Implement the real Supabase database, authentication, RLS policies and realtime functionality.

Before considering the application complete, test:

Customer can scan Table 3 QR and gets Table 3.

Customer cannot change the order to another cafe.

Customer cannot manipulate prices from browser developer tools.

Owner can only see their own cafe's orders.

Owner cannot access another cafe's data.

Unavailable food cannot be ordered.

Historical order prices remain unchanged after menu price changes.

Customers cannot modify order status.

Secrets are not exposed in frontend code.

Multiple customers can place orders simultaneously without corrupting order totals or order items.

Build the application incrementally and keep the database schema and security policies clean and maintainable.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://sipanddipcafe.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f475c1a3-8250-4e02-a342-d0886be36d25).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
