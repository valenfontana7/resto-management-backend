/**
 * Interface para entidades que pertenecen a un restaurante.
 * Usada para verificación de ownership consistente.
 */
export interface RestaurantOwned {
  restaurantId: string;
}

/**
 * Interface para entidades con soft delete.
 */
export interface SoftDeletable {
  deletedAt: Date | null;
}

/**
 * Interface base para todas las entidades del sistema.
 */
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Combina BaseEntity con RestaurantOwned para entidades típicas.
 */
export interface RestaurantOwnedEntity
  extends BaseEntity,
    RestaurantOwned,
    Partial<SoftDeletable> {}
