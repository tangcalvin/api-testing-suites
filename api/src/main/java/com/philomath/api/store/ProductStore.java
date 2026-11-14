package com.philomath.api.store;

import com.philomath.api.dto.Product;
import com.philomath.api.dto.ProductPage;
import com.philomath.api.dto.ProductRequest;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class ProductStore {

    private final ProductRepository products;

    public ProductStore(ProductRepository products) {
        this.products = products;
    }

    @Transactional
    public Product create(ProductRequest request) {
        return products.save(ProductEntity.from(request)).toRecord();
    }

    @Transactional(readOnly = true)
    public ProductPage findAfter(Long afterId, int size) {
        List<ProductEntity> rows = afterId == null
                ? products.findAllByOrderByIdAsc(PageRequest.of(0, size + 1))
                : products.findByIdGreaterThanOrderByIdAsc(afterId, PageRequest.of(0, size + 1));
        boolean more = rows.size() > size;
        List<ProductEntity> page = more ? rows.subList(0, size) : rows;
        String nextCursor = more ? Long.toString(page.get(page.size() - 1).getId()) : null;
        List<Product> content = page.stream().map(ProductEntity::toRecord).toList();
        return new ProductPage(content, size, products.count(), nextCursor);
    }

    @Transactional(readOnly = true)
    public Optional<Product> findById(long id) {
        return products.findById(id).map(ProductEntity::toRecord);
    }

    @Transactional
    public Optional<Product> update(long id, ProductRequest request) {
        return products.findById(id).map(entity -> {
            entity.apply(request);
            return products.save(entity).toRecord();
        });
    }

    @Transactional
    public boolean delete(long id) {
        if (!products.existsById(id)) {
            return false;
        }
        products.deleteById(id);
        return true;
    }

    @Transactional
    public void clear() {
        products.deleteAllInBatch();
    }
}
