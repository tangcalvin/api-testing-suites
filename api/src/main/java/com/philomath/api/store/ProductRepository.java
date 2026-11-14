package com.philomath.api.store;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProductRepository extends JpaRepository<ProductEntity, Long> {

    List<ProductEntity> findAllByOrderByIdAsc(Pageable pageable);

    List<ProductEntity> findByIdGreaterThanOrderByIdAsc(Long id, Pageable pageable);
}
