# Permission System Documentation

## Overview

The application now uses a **granular permission-based authorization system** that defines specific permissions for each role. This provides fine-grained control over what users can do in the system.

## Permission Structure

### Permission Format
Permissions follow the format: `resource:action[:scope]`

Examples:
- `posts:create` - Create new posts
- `posts:view:own` - View own posts
- `posts:view:all` - View all posts
- `posts:edit:own` - Edit own posts
- `posts:edit:all` - Edit any post
- `users:manage:roles` - Manage user roles

## Available Permissions

### Posts/Person Listing Permissions
- `posts:create` - Create new person listings
- `posts:view:own` - View own posts
- `posts:view:all` - View all posts (any user)
- `posts:edit:own` - Edit own posts
- `posts:edit:all` - Edit any post
- `posts:delete:own` - Delete own posts
- `posts:delete:all` - Delete any post

### User Management Permissions
- `users:view` - View user list
- `users:view:details` - View user details
- `users:create` - Create new users
- `users:edit` - Edit user information
- `users:delete` - Delete users
- `users:manage:roles` - Change user roles
- `users:manage:permissions` - Grant/revoke permissions

### System Management Permissions
- `system:view:stats` - View system statistics
- `system:manage:settings` - Manage system settings

### Legacy Permissions (Backward Compatibility)
- `edit:posts` - Maps to `posts:edit:all`
- `delete:posts` - Maps to `posts:delete:all`

## Role-Based Default Permissions

### Guest Role
**Default Permissions:**
- `posts:view:own` - Can only view their own posts (if any)

**Restrictions:**
- Cannot create posts
- Cannot edit posts
- Cannot delete posts
- Cannot view other users' posts
- Cannot manage users

**Use Case:** Newly registered users who need to be upgraded by an administrator.

### User Role
**Default Permissions:**
- `posts:create` - Create new posts (limited to 5 per day)
- `posts:view:own` - View own posts
- `posts:edit:own` - Edit own posts
- `posts:delete:own` - Delete own posts

**Restrictions:**
- Cannot view other users' posts
- Cannot edit/delete other users' posts
- Cannot manage users
- Limited to 5 posts per day

**Use Case:** Regular users who can create and manage their own content.

### Manager Role
**Default Permissions:**
- `posts:create` - Create new posts (unlimited)
- `posts:view:own` - View own posts
- `posts:view:all` - View all posts
- `posts:edit:own` - Edit own posts
- `posts:edit:all` - Edit any post
- `posts:delete:own` - Delete own posts
- `posts:delete:all` - Delete any post
- `users:view` - View user list
- `users:view:details` - View user details
- `system:view:stats` - View system statistics

**Restrictions:**
- Cannot create/edit/delete users
- Cannot manage user roles or permissions

**Use Case:** Supervisors who need to manage content and view user information but don't need full administrative access.

### Admin Role
**Default Permissions:**
- All Manager permissions, plus:
- `users:create` - Create new users
- `users:edit` - Edit user information
- `users:manage:permissions` - Grant/revoke permissions

**Restrictions:**
- Cannot manage user roles (cannot assign Almighty/SuperAdmin roles)
- Cannot delete users

**Use Case:** Administrators who need to manage users and permissions but shouldn't have full system control.

### SuperAdmin Role
**Default Permissions:**
- All Admin permissions, plus:
- `users:delete` - Delete users
- `users:manage:roles` - Change user roles (except Almighty)
- `system:manage:settings` - Manage system settings

**Restrictions:**
- Cannot create or modify Almighty users

**Use Case:** Senior administrators with near-full system access.

### Almighty Role
**Default Permissions:**
- **ALL PERMISSIONS** (implicitly)
- No permissions stored in array - bypasses all permission checks

**Capabilities:**
- Full system access
- Can create/modify/delete any user (including other Almighty users)
- Can grant/revoke any permission
- Can change any user's role
- Can view and manage all posts

**Use Case:** System owner/root administrator with complete control.

## How Permissions Work

### Automatic Assignment
1. **On User Creation:** When a new user is created, default permissions are automatically assigned based on their role via the User model's `pre-save` middleware.

2. **On Role Change:** When a user's role is changed, if their permissions array is empty, default permissions for the new role are automatically assigned.

3. **Manual Override:** Almighty users can manually grant/revoke specific permissions to any user, overriding default role permissions.

### Permission Checking
1. **Middleware:** The `checkPermission` middleware can be used to protect routes:
   ```javascript
   router.post('/posts', checkPermission('posts:create'), handler);
   ```

2. **In Route Handlers:** Permissions can be checked directly:
   ```javascript
   if (!user.hasPermission('posts:edit:all')) {
       // Handle unauthorized access
   }
   ```

3. **Context-Aware:** The `canEditPost` and `canDeletePost` middleware automatically check if a user has `:own` or `:all` permissions based on whether they own the resource.

### Backward Compatibility
- Legacy permissions (`edit:posts`, `delete:posts`) are automatically mapped to new permissions
- Existing code using legacy permissions will continue to work

## Managing Permissions

### Via Almighty Portal
1. Navigate to **Almighty Portal**
2. Click on a username to edit the user
3. In the **Permissions** section, you'll see all available permissions organized by category:
   - **Posts** - Post-related permissions
   - **Users** - User management permissions
   - **System** - System management permissions
   - **Legacy** - Legacy permissions (for backward compatibility)
4. Check/uncheck permissions as needed
5. Save the user

### Programmatically
Permissions can be managed via the API:
```javascript
// Grant permission
PUT /api/almighty/users/:id
{
  "permissions": ["posts:edit:all", "posts:delete:all"]
}
```

## Permission Enforcement Points

### Posts/Person Listings
- **Create:** `checkPermission('posts:create')` + daily limit middleware
- **View All:** Checked in route handler - filters results based on `posts:view:all` vs `posts:view:own`
- **View Own:** Required for `/my-posts` endpoint
- **Edit:** `canEditPost` middleware checks `posts:edit:own` or `posts:edit:all`
- **Delete:** `canDeletePost` middleware checks `posts:delete:own` or `posts:delete:all`

### User Management
- **View Users:** `checkPermission('users:view')`
- **View Details:** `checkPermission('users:view:details')`
- **Create Users:** `checkPermission('users:create')`
- **Edit Users:** `checkPermission('users:edit')`
- **Delete Users:** `checkPermission('users:delete')`
- **Manage Roles:** `checkPermission('users:manage:roles')`
- **Manage Permissions:** `checkPermission('users:manage:permissions')`

## Best Practices

1. **Principle of Least Privilege:** Grant users only the permissions they need
2. **Role-Based Defaults:** Use role-based default permissions, then customize as needed
3. **Regular Audits:** Review user permissions periodically
4. **Documentation:** Document any custom permission grants and why they were needed

## Migration Notes

### Existing Users
- Existing users will automatically get default permissions for their role when:
  - Their user record is saved (if permissions array is empty)
  - Their role is changed (if permissions array is empty)
- Users with manually set permissions will keep their existing permissions

### Updating Existing Users
To update existing users to have default permissions:
1. Clear their permissions array (set to `[]`)
2. Change their role (or save the user)
3. Default permissions will be automatically assigned

## Files Modified

- `utils/permissions.js` - Permission definitions and role defaults
- `models/User.js` - Automatic permission assignment on save
- `middleware/checkPermission.js` - Permission checking middleware
- `middleware/canEditPost.js` - Updated to use new permission system
- `routes/people.js` - Applied permissions to post operations
- `routes/auth.js` - Updated user creation to use default permissions
- `routes/almighty.js` - Updated user creation to use default permissions
- `almighty-portal.html` - Enhanced permissions UI
- `almighty-portal.js` - Dynamic permissions management

## Testing

To test the permission system:

1. **Create a Guest user** - Should only be able to view their own posts (if any)
2. **Create a User** - Should be able to create/edit/delete own posts (5 per day limit)
3. **Create a Manager** - Should be able to view/edit/delete all posts
4. **Create an Admin** - Should be able to manage users and permissions
5. **Test Almighty** - Should have access to everything

## Future Enhancements

- Permission groups/templates
- Permission inheritance
- Time-based permissions
- Permission audit logs
- Permission-based UI element visibility


