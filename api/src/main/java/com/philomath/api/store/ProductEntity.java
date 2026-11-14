package com.philomath.api.store;

import com.philomath.api.dto.CurrencyCode;
import com.philomath.api.dto.Product;
import com.philomath.api.dto.ProductRequest;
import com.philomath.api.dto.ProductStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "product")
public class ProductEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String sku;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false)
    private Double unitPrice;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 3)
    private CurrencyCode currency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ProductStatus status;

    @Column(nullable = false)
    private Integer stock;

    public static ProductEntity from(ProductRequest request) {
        ProductEntity entity = new ProductEntity();
        entity.apply(request);
        return entity;
    }

    public void apply(ProductRequest request) {
        sku = Text.trim(request.sku());
        name = Text.trim(request.name());
        unitPrice = request.unitPrice();
        currency = request.currency();
        status = request.status();
        stock = request.stock();
    }

    public Product toRecord() {
        return new Product(id, sku, name, unitPrice, currency, status, stock);
    }

    public Long getId() {
        return id;
    }
}
