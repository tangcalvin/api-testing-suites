package com.philomath.api.store;

import com.philomath.api.dto.Order;
import com.philomath.api.dto.OrderCursorPage;
import com.philomath.api.dto.OrderRequest;
import com.philomath.api.web.OrderFilter;
import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Service
public class OrderStore {

    private final OrderRepository orders;
    private final EntityManager entityManager;

    public OrderStore(OrderRepository orders, EntityManager entityManager) {
        this.orders = orders;
        this.entityManager = entityManager;
    }

    @Transactional
    public Order create(OrderRequest request) {
        return orders.save(OrderEntity.from(request)).toRecord();
    }

    @Transactional(readOnly = true)
    public Page<Order> findAll(OrderFilter filter, int page, int size) {
        return orders.findAll(matches(filter), PageRequest.of(page, size, Sort.by("id")))
                .map(OrderEntity::toRecord);
    }

    @Transactional(readOnly = true)
    public OrderCursorPage findAfter(OrderFilter filter, Long afterId, int limit) {
        Specification<OrderEntity> spec = matches(filter);
        if (afterId != null) {
            spec = spec.and((root, query, builder) -> builder.greaterThan(root.get("id"), afterId));
        }
        List<OrderEntity> rows = orders.findAll(spec, PageRequest.of(0, limit + 1, Sort.by("id"))).getContent();
        boolean more = rows.size() > limit;
        List<OrderEntity> page = more ? rows.subList(0, limit) : rows;
        String nextCursor = more ? Long.toString(page.get(page.size() - 1).getId()) : null;
        return new OrderCursorPage(page.stream().map(OrderEntity::toRecord).toList(), nextCursor);
    }

    @Transactional(readOnly = true)
    public Optional<Order> findById(long id) {
        return orders.findById(id).map(OrderEntity::toRecord);
    }

    @Transactional
    public Optional<Order> update(long id, OrderRequest request) {
        return orders.findById(id).map(entity -> {
            entity.apply(request);
            return orders.save(entity).toRecord();
        });
    }

    @Transactional
    public boolean delete(long id) {
        if (!orders.existsById(id)) {
            return false;
        }
        orders.deleteById(id);
        return true;
    }

    @Transactional
    public void clear() {
        orders.deleteAllInBatch();
        entityManager.createNativeQuery("ALTER TABLE purchase_order ALTER COLUMN id RESTART WITH 1").executeUpdate();
    }

    private static Specification<OrderEntity> matches(OrderFilter filter) {
        return (root, query, builder) -> {
            List<Predicate> predicates = new ArrayList<>();
            contains(predicates, builder, root.get("orderNumber"), filter.getOrderNumber());
            contains(predicates, builder, root.get("customerName"), filter.getCustomerName());
            contains(predicates, builder, root.get("customerEmail"), filter.getCustomerEmail());
            contains(predicates, builder, root.get("notes"), filter.getNotes());
            contains(predicates, builder, root.get("warehouseCode"), filter.getWarehouseCode());
            contains(predicates, builder, root.get("countryCode"), filter.getCountryCode());
            equal(predicates, builder, root.get("status"), filter.getStatus());
            equal(predicates, builder, root.get("priority"), filter.getPriority());
            equal(predicates, builder, root.get("currency"), filter.getCurrency());
            equal(predicates, builder, root.get("giftWrap"), filter.getGiftWrap());
            minimum(predicates, builder, root.get("quantity"), filter.getQuantityMin());
            maximum(predicates, builder, root.get("quantity"), filter.getQuantityMax());
            minimum(predicates, builder, root.get("unitPrice"), filter.getUnitPriceMin());
            maximum(predicates, builder, root.get("unitPrice"), filter.getUnitPriceMax());
            minimum(predicates, builder, root.get("taxRate"), filter.getTaxRateMin());
            maximum(predicates, builder, root.get("taxRate"), filter.getTaxRateMax());
            minimum(predicates, builder, root.get("discountAmount"), filter.getDiscountMin());
            maximum(predicates, builder, root.get("discountAmount"), filter.getDiscountMax());
            minimum(predicates, builder, root.get("orderedAt"), filter.getOrderedFrom());
            maximum(predicates, builder, root.get("orderedAt"), filter.getOrderedTo());
            minimum(predicates, builder, root.get("requestedDeliveryDate"), filter.getDeliveryFrom());
            maximum(predicates, builder, root.get("requestedDeliveryDate"), filter.getDeliveryTo());
            return builder.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static void contains(List<Predicate> predicates, jakarta.persistence.criteria.CriteriaBuilder builder,
                                 jakarta.persistence.criteria.Expression<String> path, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        String pattern = "%" + value.toLowerCase(Locale.ROOT)
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_") + "%";
        predicates.add(builder.like(builder.lower(path), pattern, '\\'));
    }

    private static <T> void equal(List<Predicate> predicates, jakarta.persistence.criteria.CriteriaBuilder builder,
                                  jakarta.persistence.criteria.Expression<T> path, T value) {
        if (value != null) {
            predicates.add(builder.equal(path, value));
        }
    }

    private static <T extends Comparable<? super T>> void minimum(List<Predicate> predicates,
                                                                  jakarta.persistence.criteria.CriteriaBuilder builder,
                                                                  jakarta.persistence.criteria.Expression<T> path, T value) {
        if (value != null) {
            predicates.add(builder.greaterThanOrEqualTo(path, value));
        }
    }

    private static <T extends Comparable<? super T>> void maximum(List<Predicate> predicates,
                                                                  jakarta.persistence.criteria.CriteriaBuilder builder,
                                                                  jakarta.persistence.criteria.Expression<T> path, T value) {
        if (value != null) {
            predicates.add(builder.lessThanOrEqualTo(path, value));
        }
    }
}
