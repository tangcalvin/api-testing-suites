package com.philomath.api.store;

import com.philomath.api.dto.CurrencyCode;
import com.philomath.api.dto.DeliveryAddress;
import com.philomath.api.dto.Order;
import com.philomath.api.dto.Region;
import com.philomath.api.dto.OrderRequest;
import com.philomath.api.dto.OrderStatus;
import com.philomath.api.dto.Priority;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;

@Entity
@Table(name = "purchase_order")
public class OrderEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 40)
    private String orderNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private OrderStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Priority priority;

    @Column(nullable = false, length = 80)
    private String customerName;

    @Column(nullable = false, length = 120)
    private String customerEmail;

    @Column(nullable = false)
    private Integer quantity;

    @Column(nullable = false)
    private Double unitPrice;

    @Column(nullable = false)
    private Double taxRate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 3)
    private CurrencyCode currency;

    @Column(nullable = false)
    private Double discountAmount;

    @Column(nullable = false, length = 2)
    private String countryCode;

    @Column(nullable = false)
    private OffsetDateTime orderedAt;

    @Column(nullable = false)
    private LocalDate requestedDeliveryDate;

    @Column(length = 500)
    private String notes;

    @Column(nullable = false)
    private Boolean giftWrap;

    @Column(nullable = false, length = 20)
    private String warehouseCode;

    @Column(length = 20)
    private String couponCode;

    @Column(length = 20)
    private String promotionCode;

    @Column(length = 120)
    private String deliveryLine1;

    @Column(length = 80)
    private String deliveryCity;

    @Column(length = 12)
    private String deliveryPostalCode;

    @Column(length = 12)
    private String deliveryRegionCode;

    @Column(length = 80)
    private String deliveryRegionName;

    @Column
    private Boolean options;

    public static OrderEntity from(OrderRequest request) {
        OrderEntity entity = new OrderEntity();
        entity.apply(request);
        return entity;
    }

    public void apply(OrderRequest request) {
        orderNumber = Text.trim(request.orderNumber());
        status = request.status();
        priority = request.priority();
        customerName = Text.trim(request.customerName());
        customerEmail = Text.trim(request.customerEmail());
        quantity = request.quantity();
        unitPrice = request.unitPrice();
        taxRate = request.taxRate();
        currency = request.currency();
        discountAmount = request.discountAmount();
        countryCode = Text.trim(request.countryCode());
        orderedAt = request.orderedAt();
        requestedDeliveryDate = request.requestedDeliveryDate();
        notes = Text.trim(request.notes());
        giftWrap = request.giftWrap();
        warehouseCode = Text.trim(request.warehouseCode());
        couponCode = Text.trim(request.couponCode());
        promotionCode = Text.trim(request.promotionCode());
        DeliveryAddress address = request.deliveryAddress();
        deliveryLine1 = address == null ? null : Text.trim(address.line1());
        deliveryCity = address == null ? null : Text.trim(address.city());
        deliveryPostalCode = address == null ? null : Text.trim(address.postalCode());
        Region region = address == null ? null : address.region();
        deliveryRegionCode = region == null ? null : Text.trim(region.code());
        deliveryRegionName = region == null ? null : Text.trim(region.name());
        options = request.options() == null ? null : Boolean.TRUE;
    }

    public Order toRecord() {
        return new Order(
                id,
                orderNumber,
                status,
                priority,
                customerName,
                customerEmail,
                quantity,
                unitPrice,
                taxRate,
                currency,
                discountAmount,
                countryCode,
                orderedAt,
                requestedDeliveryDate,
                notes,
                giftWrap,
                warehouseCode,
                couponCode,
                promotionCode,
                deliveryAddress(),
                Boolean.TRUE.equals(options) ? Map.of() : null
        );
    }

    private DeliveryAddress deliveryAddress() {
        if (deliveryLine1 == null && deliveryCity == null && deliveryPostalCode == null
                && deliveryRegionCode == null && deliveryRegionName == null) {
            return null;
        }
        Region region = deliveryRegionCode == null && deliveryRegionName == null
                ? null
                : new Region(deliveryRegionCode, deliveryRegionName);
        return new DeliveryAddress(deliveryLine1, deliveryCity, deliveryPostalCode, region);
    }

    public Long getId() {
        return id;
    }
}
